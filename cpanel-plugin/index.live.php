<?php
//     /usr/local/cpanel/base/3rdparty/imh-ai-assistant/index.live.php

declare(strict_types=1);
error_log("IMH DEBUG REMOTE_USER=" . (getenv('REMOTE_USER') ?: ''));
error_log("IMH DEBUG TOKEN=" . (getenv('CPANEL_SECURITY_TOKEN') ?: ''));
require_once '/usr/local/cpanel/php/cpanel.php';
$cpanel = new CPANEL();

print $cpanel->header('IMH AI Assistant', 'IMH AI Assistant');
?>
<link rel="stylesheet" href="imh-ai-assistant.css">

<div id="ai-assistant-block"></div>

<script>
  // cPanel provides CPANEL.security_token in-page for authenticated sessions.
  // We expose what our app needs in a stable place.
  window.IMH_AI_ASSISTANT = {
    security_token: (window.CPANEL && CPANEL.security_token) ? CPANEL.security_token : '',
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