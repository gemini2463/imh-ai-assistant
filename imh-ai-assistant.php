<?php
// AI Assistant
/**
 * DNS Manager Web Interface for cPanel/WHM and CWP
 *
 * Provides a web interface to manage DNS settings.
 *
 * Compatible with:
 *   - cPanel/WHM: /usr/local/cpanel/whostmgr/docroot/cgi/imh-dns-manager/index.php
 *   - CWP:       /usr/local/cwpsrv/htdocs/resources/admin/modules/imh-dns-manager.php
 *
 * Maintainer: InMotion Hosting
 * Version: 0.0.1
 */


// ==========================
// 1. Environment Detection
// 2. Session & Security
// 3. HTML Header
// 4. Main Interface
// 5. DNS Manager Tab
// 6. DNS Zone File Editor Tab
// 7. DNS Scanning Tab
// 8. HTML Footer
// ==========================





// ==========================
// 1. Environment Detection
// ==========================

declare(strict_types=1);

$isCPanelServer = (
  (is_dir('/usr/local/cpanel') || is_dir('/var/cpanel') || is_dir('/etc/cpanel')) && (is_file('/usr/local/cpanel/cpanel') || is_file('/usr/local/cpanel/version'))
);

$isCWPServer = (
  is_dir('/usr/local/cwp')
);

if ($isCPanelServer) {
  if (getenv('REMOTE_USER') !== 'root') exit('Access Denied');

  if (session_status() === PHP_SESSION_NONE) {
    session_start();
  }
} elseif ($isCWPServer) { // CWP
  if (!isset($_SESSION['logged']) || $_SESSION['logged'] != 1 || !isset($_SESSION['username']) || $_SESSION['username'] !== 'root') {
    exit('Access Denied');
  }
};










// ==========================
// 2. Session & Security
// ==========================

$CSRF_TOKEN = NULL;

if (!isset($_SESSION['csrf_token'])) {
  $CSRF_TOKEN = bin2hex(random_bytes(32));
  $_SESSION['csrf_token'] = $CSRF_TOKEN;
} else {
  $CSRF_TOKEN = $_SESSION['csrf_token'];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (
    !isset($_POST['csrf_token'], $_SESSION['csrf_token']) ||
    !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])
  ) {
    exit("Invalid CSRF token");
  }
}

define('IMH_DNS_CACHE_DIR', '/var/cache/imh-dns-manager');

if (!is_dir(IMH_DNS_CACHE_DIR)) {
  mkdir(IMH_DNS_CACHE_DIR, 0700, true);
}

// Clear old cache files

$cache_dir = IMH_DNS_CACHE_DIR;
$expire_seconds = 3600; // e.g. 1 hour

foreach (glob("$cache_dir/*.cache") as $file) {
  if (is_file($file) && (time() - filemtime($file) > $expire_seconds)) {
    unlink($file);
  }
}

function imh_safe_cache_filename(string $tag): string
{
  // 1. Sanitize the tag by allowing only a safe subset of characters.
  $safe_tag = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $tag);
  // 2. Truncate the sanitized tag to a reasonable length to prevent filesystem errors.
  $truncated_tag = substr($safe_tag, 0, 55); // Truncate to 55 to leave room for the hash
  // 3. Append a short, fast hash of the ORIGINAL tag to guarantee uniqueness and avoid collisions.
  $hash = hash('crc32b', $tag); // crc32b is very fast and sufficient for this purpose.
  return IMH_DNS_CACHE_DIR . '/sar_' . $truncated_tag . '_' . $hash . '.cache';
}



function imh_cached_shell_exec($tag, $command, $sar_interval)
{
  $cache_file = imh_safe_cache_filename($tag);
  $lock_file  = $cache_file . '.lock';
  $fp = fopen($lock_file, 'c');
  if ($fp === false) return false;

  $maxRetries = 10; // Try up to 10 times
  $retryDelay = 200000; // 200ms (in microseconds)

  $locked = false;
  for ($i = 0; $i < $maxRetries; $i++) {
    if (flock($fp, LOCK_EX | LOCK_NB)) {
      $locked = true;
      break;
    }
    // Another process has the lock → wait briefly
    usleep($retryDelay);
  }

  if (!$locked) {
    fclose($fp);
    return false; // Give up after retries
  }

  try {
    // At this point we hold the lock
    if (file_exists($cache_file)) {
      $mtime = filemtime($cache_file);
      if ($mtime && (time() - $mtime < $sar_interval)) {
        $cached = file_get_contents($cache_file);
        if ($cached !== false && strlen(trim($cached)) > 0) {
          return $cached;
        }
      }
    }

    $out = shell_exec($command);
    if (!is_string($out) || trim($out) === '') {
      return false;
    }
    file_put_contents($cache_file, $out);
    chmod($cache_file, 0600);
    return $out;
  } finally {
    flock($fp, LOCK_UN);
    fclose($fp);
    @unlink($lock_file);
  }
}




// Runs a shell command safely with a timeout, preventing hangs.

function safe_shell_exec(string $command, int $timeout = 3): string
{
  static $timeout_bin = null;
  if ($timeout_bin === null) {
    // Find the timeout binary path once
    $found = trim(shell_exec('command -v timeout 2>/dev/null') ?: '');
    $timeout_bin = $found !== '' ? $found : false;
  }

  if ($timeout_bin) {
    // Only escape the path to timeout, not the actual command
    $cmd = escapeshellarg($timeout_bin) . ' ' . (int)$timeout . 's ' . $command;
    $out = shell_exec($cmd);
    return is_string($out) ? $out : '';
  }

  // Fallback: no timeout binary, use proc_open() with stream_select timeout
  $descriptorspec = [
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w']
  ];
  $process = proc_open($command, $descriptorspec, $pipes);
  if (!is_resource($process)) return '';

  $output = '';
  $start = time();
  $readStreams = [$pipes[1], $pipes[2]];

  while (!empty($readStreams) && (time() - $start) < $timeout) {
    $readCopy = $readStreams;
    $write = null;
    $except = null;

    if (stream_select($readCopy, $write, $except, 1) > 0) {
      foreach ($readCopy as $stream) {
        $chunk = stream_get_contents($stream);
        if ($chunk !== false) {
          $output .= $chunk;
        }
        $key = array_search($stream, $readStreams, true);
        unset($readStreams[$key]);
      }
    }
  }

  foreach ($pipes as $pipe) {
    fclose($pipe);
  }
  proc_terminate($process);
  proc_close($process);

  // Return raw output (don't trim so whitespace/newlines are preserved)
  return is_string($output) ? $output : '';
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

$server_time_full = safe_shell_exec('timedatectl', 2);
if (!$server_time_full) {
  $server_time = 'Time unavailable';
} else {
  $server_time_lines = explode("\n", trim($server_time_full));
  $server_time = $server_time_lines[0] ?? 'Time unavailable';
}





// ==========================
// 3. HTML Header & CSS
// ==========================

if ($isCPanelServer) {
  require_once('/usr/local/cpanel/php/WHM.php');
  WHM::header('imh-dns-manager WHM Interface', 0, 0);
} else {
  echo '<div class="panel-body">';
};

$cssPath = $isCWPServer ? 'design/css/imh-dns-manager.css' : 'imh-dns-manager.css';
echo '<link rel="stylesheet" href="' . htmlspecialchars($cssPath) . '" />';


// ==========================
// 4. Main Interface
// ==========================

$img_src = $isCWPServer ? 'design/img/imh-dns-manager.png' : 'imh-dns-manager.png';
echo '<h1 class="imh-title"><img src="' . htmlspecialchars($img_src) . '" alt="dns-manager" class="imh-title-img" />DNS Manager</h1>';



// This is the tab selector for the three sections

echo '<div class="tabs-nav" id="imh-tabs-nav">
    <button type="button" class="active" data-tab="tab-dns-manager" aria-label="DNS Manager tab">DNS Manager</button>
    <button type="button" data-tab="tab-file-editor" aria-label="Zone File Editor tab">Zone File Editor</button>
    <button type="button" data-tab="tab-dns-scanner" aria-label="DNS Scanner tab">DNS Scanner</button>
</div>';





// Tab selector script

?>

<script>
  // Tab navigation functionality

  document.querySelectorAll('#imh-tabs-nav button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Remove 'active' class from all buttons and tab contents
      document.querySelectorAll('#imh-tabs-nav button').forEach(btn2 => btn2.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      // Activate this button and the corresponding tab
      btn.classList.add('active');
      var tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });
</script>

<?php






// ==========================
// 5. DNS Manager tab
// ==========================

echo '<div id="tab-dns-manager" class="tab-content active">';

echo "<div class='imh-box imh-box.margin-bottom'><p class='imh-larger-text'>DNS Manager controls the DNS settings and configurations for your server.</p>";
echo '</div>';
echo '</div>'; // End of DNS Manager tab






// ==========================
// 6. Zone File Editor tab
// ==========================

echo '<div id="tab-file-editor" class="tab-content">';

echo "<div class='imh-box imh-box.margin-bottom'><p class='imh-larger-text'>Zone File Editor allows you to edit DNS zone files directly.</p>";
echo '</div>';
echo '</div>'; // End of Zone File Editor tab





// ==========================
// 7. DNS Scanner tab
// ==========================

echo '<div id="tab-dns-scanner" class="tab-content">';

echo "<div class='imh-box imh-box.margin-bottom'><p class='imh-larger-text'>DNS Scanner allows you to scan and analyze DNS configurations.</p>";
echo '</div>';
echo '</div>'; // End of DNS Scanner tab






// ==========================
// 8. HTML Footer
// ==========================

// JavaScript for Vite/React app loading
$jsPath = $isCWPServer ? 'design/js/imh-dns-manager.js' : 'imh-dns-manager.js';

if ($isCPanelServer) {
  echo '<script type="module" crossorigin src="imh-dns-manager.js"></script>';
} else {
  echo '<script type="module" crossorigin src="' . htmlspecialchars($jsPath) . '"></script>';
}



echo '<div class="imh-footer-box"><img src="' . htmlspecialchars($img_src) . '" alt="dns-manager" class="imh-footer-img" /><p>Plugin by <a href="https://inmotionhosting.com" target="_blank">InMotion Hosting</a>.</p></div>';




if ($isCPanelServer) {
  WHM::footer();
} else {
  echo '</div>';
};
