<?php
// AJAX handler for imh-ai-assistant.php
// /usr/local/cwpsrv/htdocs/resources/admin/addons/ajax/ajax_imh-ai-assistant.php
error_reporting(E_ALL);
@ini_set('display_errors', '1');
@ini_set('error_log', '/usr/local/cwpsrv/htdocs/resources/admin/modules/imh-ai-assistant/error.log');

session_start(); 

function json_response(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

// Runs a shell command safely with a timeout, preventing hangs.

function safe_shell_exec(string $command, int $timeout = 3): array
{
    static $timeout_bin = null;
    if ($timeout_bin === null) {
        $found = trim(shell_exec('command -v timeout 2>/dev/null') ?: '');
        $timeout_bin = $found !== '' ? $found : false;
    }

    if ($timeout_bin) {
        $cmd = escapeshellarg($timeout_bin) . ' ' . (int)$timeout . 's ' . $command;
        $out = shell_exec($cmd);
        // simple mode: only stdout, no stderr/exitCode available
        return [
            'stdout'   => is_string($out) ? $out : '',
            'stderr'   => '',
            'exitCode' => -1,
            'timedOut' => false,
        ];
    }

    $descriptorspec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ];
    $process = proc_open($command, $descriptorspec, $pipes);
    if (!is_resource($process)) {
        return [
            'stdout'   => '',
            'stderr'   => 'Failed to start process',
            'exitCode' => -1,
            'timedOut' => false,
        ];
    }

    $output = '';
    $stderr = '';
    $start  = time();
    $readStreams = [$pipes[1], $pipes[2]];

    while (!empty($readStreams) && (time() - $start) < $timeout) {
        $readCopy = $readStreams;
        $write = null;
        $except = null;

        if (stream_select($readCopy, $write, $except, 1) > 0) {
            foreach ($readCopy as $stream) {
                $chunk = stream_get_contents($stream);
                if ($chunk !== false) {
                    if ($stream === $pipes[1]) {
                        $output .= $chunk;
                    } else {
                        $stderr .= $chunk;
                    }
                }
                $key = array_search($stream, $readStreams, true);
                unset($readStreams[$key]);
            }
        }
    }

    $stdout_rem = stream_get_contents($pipes[1]);
    if ($stdout_rem !== false) {
        $output .= $stdout_rem;
    }
    $stderr_rem = stream_get_contents($pipes[2]);
    if ($stderr_rem !== false) {
        $stderr .= $stderr_rem;
    }

    $status   = proc_get_status($process);
    $exitCode = isset($status['exitcode']) && $status['exitcode'] !== -1 ? $status['exitcode'] : null;

    if (!empty($status['running'])) {
        proc_terminate($process);
        usleep(100000);

        $stdout_rem = stream_get_contents($pipes[1]);
        if ($stdout_rem !== false) {
            $output .= $stdout_rem;
        }
        $stderr_rem = stream_get_contents($pipes[2]);
        if ($stderr_rem !== false) {
            $stderr .= $stderr_rem;
        }

        $status   = proc_get_status($process);
        $exitCode = isset($status['exitcode']) && $status['exitcode'] !== -1 ? $status['exitcode'] : $exitCode;
    }

    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    proc_terminate($process);
    proc_close($process);

    return [
        'stdout'   => is_string($output) ? $output : '',
        'stderr'   => is_string($stderr) ? $stderr : '',
        // current behavior: integer always, -1 means "no exit code available"
        'exitCode' => is_int($exitCode) ? $exitCode : -1,
        'timedOut' => (time() - $start) >= $timeout,
    ];
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

// Read raw body
$rawInput = file_get_contents('php://input');

// Decode JSON as assoc array
$data = json_decode($rawInput, true);

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
    
