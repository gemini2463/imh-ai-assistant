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











$rawInput = file_get_contents('php://input');

if ($rawInput !== '') {

  session_start();


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

/**
 * Split a command string into argv similar to a shell, but we will NOT execute via a shell.
 * Supports basic quotes. Rejects shell metacharacters entirely.
 */
function parse_command_argv(string $cmd): array
{
    $cmd = trim($cmd);
    if ($cmd === '') return [];

    // Reject shell metacharacters that only make sense with a shell interpreter.
    // This is a strong guardrail. Adjust only if you truly need some of these.
    $forbidden = ['|','&',';','<','>','(',')','{','}','[',']','*','?','!','`',"\n","\r"];
    foreach ($forbidden as $ch) {
        if (str_contains($cmd, $ch)) {
            throw new RuntimeException("Forbidden shell operator detected.");
        }
    }
    // Also reject common expansions
    if (preg_match('/\$\(|\$\{|\$\w+/', $cmd)) {
        throw new RuntimeException("Forbidden shell expansion detected.");
    }

    // Tokenize respecting simple single/double quotes.
    preg_match_all('/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|\'([^\']*)\'|(\S+)/', $cmd, $m);
    $argv = [];
    foreach ($m[0] as $i => $_token) {
        if ($m[1][$i] !== '') {
            $argv[] = stripcslashes($m[1][$i]); // double-quoted
        } elseif ($m[2][$i] !== '') {
            $argv[] = $m[2][$i]; // single-quoted
        } else {
            $argv[] = $m[3][$i]; // bare
        }
    }
    return $argv;
}

/**
 * Enforce an allowlist of commands and (optionally) restrict args.
 * Customize $allowed to the commands you truly need.
 */
function authorize_command(array $argv): array
{
    if (count($argv) === 0) {
        throw new RuntimeException("Empty command.");
    }

    // Map command -> absolute path (recommended) OR true to resolve via PATH.
    // Using absolute paths reduces “PATH hijack” issues.
    $allowed = [
        'pwd'    => '/bin/pwd',
        'ls'     => '/bin/ls',
        'stat'   => '/usr/bin/stat',
        'file'   => '/usr/bin/file',

        'cat'    => '/bin/cat',
        'head'   => '/usr/bin/head',
        'tail'   => '/usr/bin/tail',
        'grep'   => '/bin/grep',
        'wc'     => '/usr/bin/wc',
        'sort'   => '/usr/bin/sort',
        'uniq'   => '/usr/bin/uniq',
        'cut'    => '/usr/bin/cut',

        'du'     => '/usr/bin/du',
        'df'     => '/bin/df',

        'whoami' => '/usr/bin/whoami',
        'id'     => '/usr/bin/id',
        'date'   => '/bin/date',
        'uname'  => '/bin/uname',
        'uptime' => '/usr/bin/uptime',

        'curl' => '/usr/bin/curl',
        'wget' => '/usr/bin/wget',
        'dig'  => '/usr/bin/dig',

        // Optional (only if you add the extra arg restrictions below):
        // 'find' => '/usr/bin/find',
        // 'php'  => '/usr/bin/php',
    ];

    $cmd = $argv[0];

    if (!array_key_exists($cmd, $allowed)) {
        throw new RuntimeException("Command not permitted.");
    }

    // Optional: restrict risky flags for certain tools
    // Example: prevent "ps auxfww" if you don't want wide output, etc.
    // Example: disallow grep reading binary, or awk executing system() isn't possible without a shell anyway.

    // Replace argv[0] with absolute binary path
    $argv[0] = $allowed[$cmd];

    // Optional: restrict file paths to within the user's HOME
    // This is strongly recommended in shared hosting/cPanel contexts.
    $home = getenv('HOME') ?: '';

    $homePrefix = $home !== '' ? rtrim($home, '/') . '/' : '';

    $blockedPrefixes = [
        '/etc/', '/proc/', '/sys/', '/dev/', '/run/', '/var/log/', '/root/', '/home/', // block absolute sensitive areas
    ];

    for ($i = 1; $i < count($argv); $i++) {
        $a = $argv[$i];

        // Skip flags
        if ($a === '' || $a[0] === '-') continue;

        // If it looks like a path, resolve and jail it
        if (preg_match('#^/|^\./|^\.\./#', $a)) {
            $resolved = realpath($a);
            if ($resolved === false) {
                throw new RuntimeException("Path not found.");
            }

            $resolvedWithSlash = rtrim($resolved, '/') . '/';

            // Block sensitive prefixes even if something weird happens
            foreach ($blockedPrefixes as $bp) {
                if (str_starts_with($resolvedWithSlash, $bp)) {
                    throw new RuntimeException("Path not permitted.");
                }
            }

            // Hard jail to $HOME (this is the main control in shared hosting)
            if ($homePrefix !== '' && !str_starts_with($resolvedWithSlash, $homePrefix)) {
                throw new RuntimeException("Path not permitted.");
            }
        }
    }

    if ($home !== '') {
        for ($i = 1; $i < count($argv); $i++) {
            // If an argument looks like a path, enforce it stays under $home.
            // Heuristic: starts with / or ./ or ../
            if (preg_match('#^/|^\./|^\.\./#', $argv[$i])) {
                $resolved = realpath($argv[$i]);
                if ($resolved === false || !str_starts_with($resolved, rtrim($home, '/') . '/')) {
                    throw new RuntimeException("Path not permitted.");
                }
            }
        }
    }

    return $argv;
}

/**
 * Execute argv without a shell, with timeout and output cap.
 */
function exec_argv(array $argv, int $timeout = 3, int $maxBytes = 200000): array
{
    $descriptorspec = [
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    // PHP supports array command to bypass shell (best practice).
    $process = proc_open($argv, $descriptorspec, $pipes, null, null, ['bypass_shell' => true]);
    if (!is_resource($process)) {
        return ['stdout' => '', 'stderr' => 'Failed to start process', 'exitCode' => -1, 'timedOut' => false];
    }

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
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

        if ((microtime(true) - $start) >= $timeout) {
            $timedOut = true;
            proc_terminate($process);
            break;
        }

        $write = null; $except = null;
        if (!empty($read)) {
            @stream_select($read, $write, $except, 0, 200000);
            foreach ($read as $r) {
                $chunk = stream_get_contents($r);
                if ($chunk === false || $chunk === '') continue;
                if ($r === $pipes[1]) $stdout .= $chunk;
                else $stderr .= $chunk;

                if (strlen($stdout) + strlen($stderr) > $maxBytes) {
                    $timedOut = true;
                    proc_terminate($process);
                    break 2;
                }
            }
        } else {
            usleep(20000);
        }
    }

    foreach ($pipes as $pipe) fclose($pipe);

    $status = proc_get_status($process);
    $exitCode = isset($status['exitcode']) && $status['exitcode'] !== -1 ? (int)$status['exitcode'] : -1;
    proc_close($process);

    if (strlen($stdout) > $maxBytes) $stdout = substr($stdout, 0, $maxBytes) . "\n[output truncated]";
    if (strlen($stderr) > $maxBytes) $stderr = substr($stderr, 0, $maxBytes) . "\n[output truncated]";

    return ['stdout' => $stdout, 'stderr' => $stderr, 'exitCode' => $exitCode, 'timedOut' => $timedOut];
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

    try {
        $argv = parse_command_argv($shellCmd);
        $argv = authorize_command($argv);
    } catch (Throwable $e) {
        json_response(['success' => false, 'error' => 'Command rejected: ' . $e->getMessage()], 403);
    }

    $makeItSo = exec_argv($argv, 3, 200000);

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

};



    print $cpanel->header('IMH AI Assistant', 'IMH AI Assistant');
?>

<!-- <h1><img src="imh-ai-assistant.png" alt="AI Assistant" class="imh-title-img" /> IMH AI Assistant</h1> -->

<link rel="stylesheet" href="imh-ai-assistant.css">

<div id="ai-assistant-block"></div>

<script>
  // We expose what our app needs in a stable place.
  window.IMH_AI_ASSISTANT = {
    security_token: "<?php echo $session_id; ?>",
    ajax_shell_path: "index.live.php"
  };
</script>

<script src="imh-ai-assistant.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/js/all.min.js" crossorigin="anonymous"></script>

<?php
    print $cpanel->footer();
    $cpanel->end();
?>