<?php

$root = dirname(__DIR__);
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
if ($path !== "/" && is_file($root . $path)) return false;
$_SERVER["SCRIPT_NAME"] = "/index.php";
$_SERVER["SCRIPT_FILENAME"] = $root . "/index.php";
require $root . "/index.php";
