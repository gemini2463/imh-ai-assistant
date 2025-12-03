<?php
ob_start();
include '/usr/local/cwpsrv/htdocs/admin/admin/index2.php';
$html = ob_get_clean();
$html = preg_replace('~</body>\s*</html>\s*$~i', '', $html);
echo $html;

echo '<style>';
include '/usr/local/cwpsrv/htdocs/admin/design/css/imh-ai-assistant.css';
echo '</style>';

echo '<div id="ai-assistant-block"></div>';
echo '<script src="https://kit.fontawesome.com/cddc9c6dd6.js" crossorigin="anonymous"></script>';
echo "<script>\n";
include '/usr/local/cwpsrv/htdocs/admin/design/js/imh-ai-assistant.js';
echo "\n</script>\n";

echo '</body></html>';