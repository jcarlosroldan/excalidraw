<?php

require_once __DIR__ . "/oink.php";

$base = rtrim(str_replace("\\", "/", dirname($_SERVER["SCRIPT_NAME"])), "/");
Oink\serve(__DIR__ . "/endpoints.php", base_path: $base . "/api");

?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
<meta name="theme-color" content="#121212">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='0.9em' font-size='90'%3E✏️%3C/text%3E%3C/svg%3E">
<title>Excalidraw</title>
<link rel="stylesheet" href="static/assets/app.css">
<script>window.EXCALIDRAW_ASSET_PATH = new URL("static/excalidraw-assets/", document.baseURI).href;</script>
</head>
<body>
<div id="root"></div>
<script type="module" src="static/assets/app.js"></script>
</body>
</html>
