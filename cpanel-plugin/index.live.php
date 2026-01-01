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
  window.IMH_AI_ASSISTANT.ajax_shell_path =
    window.IMH_AI_ASSISTANT.security_token +
    "/3rdparty/imh-ai-assistant/ajax_imh-ai-assistant.live.php";
</script>

<script src="imh-ai-assistant.js"></script>

<?php
print $cpanel->footer();
$cpanel->end();