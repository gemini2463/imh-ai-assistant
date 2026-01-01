<?php
//     /usr/local/cpanel/base/3rdparty/imh-ai-assistant/index.live.php

declare(strict_types=1);



error_reporting(E_ALL);
@ini_set('display_errors', '0'); // important for JSON endpoints
@ini_set('log_errors', '1');
@ini_set('error_log', '/usr/local/cpanel/base/3rdparty/imh-ai-assistant/error.log');


















require_once '/usr/local/cpanel/php/cpanel.php';
$cpanel = new CPANEL();

preg_match('/(cpsess[a-z0-9]+)/i', $_SERVER['REQUEST_URI'], $matches);
$session_id = $matches[1] ?? '';













session_start();

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

function json_response(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

$cpuser = getenv('REMOTE_USER') ?: '';
if ($cpuser === '') {
    json_response(['success' => false, 'error' => 'Access Denied'], 403);
}

if (JSON_ERROR_NONE !== json_last_error()) {
    json_response(['success' => false, 'error' => 'Invalid JSON: ' . json_last_error_msg()], 400);
}
if (!is_array($data)) {
    json_response(['success' => false, 'error' => 'JSON payload must be an object'], 400);
}

$shellCmd = isset($data['shellCmd']) ? trim((string)$data['shellCmd']) : '';
if ($shellCmd === '') {
    json_response(['success' => false, 'error' => 'Missing required field: shellCmd'], 422);
}

$shellCmd = trim($shellCmd);

// Basic sanity limits (prevents abuse and weird edge cases)
if ($shellCmd === '' || strlen($shellCmd) > 2000) {
    json_response(['success' => false, 'error' => 'Invalid command length'], 422);
}
if (str_contains($shellCmd, "\0")) {
    json_response(['success' => false, 'error' => 'Invalid command'], 422);
}

// Runs a shell command safely with a timeout, preventing hangs.

function safe_shell_exec(string $command, int $timeout = 3, int $maxBytes = 200000): array
{
    static $timeout_bin = null;
    if ($timeout_bin === null) {
        $found = trim(shell_exec('command -v timeout 2>/dev/null') ?: '');
        $timeout_bin = $found !== '' ? $found : false;
    }

    if ($timeout_bin) {
        // Note: stderr/exitCode not captured in this mode (as in your original)
        $cmd = escapeshellarg($timeout_bin) . ' ' . (int)$timeout . 's ' . $command;
        $out = shell_exec($cmd);
        $stdout = is_string($out) ? $out : '';
        if (strlen($stdout) > $maxBytes) $stdout = substr($stdout, 0, $maxBytes) . "\n[output truncated]";
        return ['stdout' => $stdout, 'stderr' => '', 'exitCode' => -1, 'timedOut' => false];
    }

    $descriptorspec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($command, $descriptorspec, $pipes);
    if (!is_resource($process)) {
        return ['stdout' => '', 'stderr' => 'Failed to start process', 'exitCode' => -1, 'timedOut' => false];
    }

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $output = '';
    $stderr = '';
    $start = microtime(true);
    $timedOut = false;

    while (true) {
        $status = proc_get_status($process);
        $running = !empty($status['running']);

        $read = [];
        if (!feof($pipes[1])) $read[] = $pipes[1];
        if (!feof($pipes[2])) $read[] = $pipes[2];

        if (!$running && empty($read)) break;

        $elapsed = microtime(true) - $start;
        if ($elapsed >= $timeout) {
            $timedOut = true;
            proc_terminate($process);
            break;
        }

        $write = null; $except = null;
        if (!empty($read)) {
            // Wait up to 200ms for output
            @stream_select($read, $write, $except, 0, 200000);
            foreach ($read as $r) {
                $chunk = stream_get_contents($r);
                if ($chunk === false || $chunk === '') continue;

                if ($r === $pipes[1]) $output .= $chunk;
                else $stderr .= $chunk;

                if (strlen($output) + strlen($stderr) > $maxBytes) {
                    $timedOut = true; // treat as forced stop
                    proc_terminate($process);
                    break 2;
                }
            }
        } else {
            usleep(20000);
        }
    }

    foreach ($pipes as $pipe) {
        fclose($pipe);
    }

    $status = proc_get_status($process);
    $exitCode = isset($status['exitcode']) && $status['exitcode'] !== -1 ? (int)$status['exitcode'] : -1;

    proc_close($process);

    if (strlen($output) > $maxBytes) $output = substr($output, 0, $maxBytes) . "\n[output truncated]";
    if (strlen($stderr) > $maxBytes) $stderr = substr($stderr, 0, $maxBytes) . "\n[output truncated]";

    return ['stdout' => $output, 'stderr' => $stderr, 'exitCode' => $exitCode, 'timedOut' => $timedOut];
}

// Find local timezone and set it for date functions

$server_tz = trim(shell_exec('date +%Z')); // e.g. "EDT"
$tz_name = @timezone_name_from_abbr($server_tz);
if ($tz_name !== false) {
  date_default_timezone_set($tz_name);
} else {
  // fallback: use system-configured timezone
  date_default_timezone_set(@date_default_timezone_get());
}

if (JSON_ERROR_NONE !== json_last_error()) {
    json_response([
        'success' => false,
        'error'   => 'Invalid JSON: ' . json_last_error_msg(),
    ], 400);
}

if (!is_array($data)) {
    json_response([
        'success' => false,
        'error'   => 'JSON payload must be an object',
    ], 400);
}

// Extract and lightly validate fields
$shellCmd = isset($data['shellCmd']) ? (string) $data['shellCmd'] : null;

if ($shellCmd === null) {
    json_response([
        'success' => false,
        'error'   => 'Missing required field: shellCmd',
    ], 422);
}

$makeItSo = safe_shell_exec($shellCmd);

if (!is_array($makeItSo) ||
    !array_key_exists('stdout', $makeItSo) ||
    !array_key_exists('stderr', $makeItSo) ||
    !array_key_exists('exitCode', $makeItSo)) {

    json_response([
        'success' => false,
        'error'   => 'Command execution failed',
    ], 500);
}

json_response([
    'success'  => true,
    'received' => [
        'shellCmd' => $shellCmd,
        'stdout'   => $makeItSo['stdout'],
        'stderr'   => $makeItSo['stderr'],
        'exitCode' => $makeItSo['exitCode'],
    ],
]);











print $cpanel->header('IMH AI Assistant', 'IMH AI Assistant');
?>
<link rel="stylesheet" href="imh-ai-assistant.css">

<div id="ai-assistant-block">
Hello.
</div>

<script>
  // We expose what our app needs in a stable place.
  window.IMH_AI_ASSISTANT = {
    security_token: "<?php echo $session_id; ?>",
    ajax_shell_path: null
  };

  // Build the absolute in-panel path to your LivePHP AJAX endpoint:
  window.IMH_AI_ASSISTANT.ajax_shell_path = "index.live.php";
</script>

<script src="imh-ai-assistant.js"></script>

<?php
print $cpanel->footer();
$cpanel->end();