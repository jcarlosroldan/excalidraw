<?php

namespace DB;

$_conn = null;
function conn() {
	global $_conn;
	if ($_conn === null) {
		$path = __DIR__ . "/data/data.db";
		if (!is_dir(dirname($path))) @mkdir(dirname($path), 0775, true);
		$populate = !file_exists($path);
		$_conn = new \PDO("sqlite:" . $path);
		$_conn->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
		$_conn->exec("PRAGMA journal_mode = WAL");
		if ($populate) $_conn->exec("
			CREATE TABLE users (
				id INTEGER PRIMARY KEY,
				username TEXT UNIQUE NOT NULL,
				password TEXT NOT NULL,
				created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE sessions (
				token TEXT PRIMARY KEY,
				user_id INTEGER NOT NULL REFERENCES users(id),
				created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE scenes (
				user_id INTEGER PRIMARY KEY REFERENCES users(id),
				data TEXT NOT NULL,
				updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE libraries (
				user_id INTEGER PRIMARY KEY REFERENCES users(id),
				data TEXT NOT NULL,
				updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			);
		");
	}
	return $_conn;
}

function user_by_name($username) {
	$q = conn()->prepare("SELECT * FROM users WHERE username = :u");
	$q->execute([":u" => $username]);
	return $q->fetch(\PDO::FETCH_ASSOC);
}

function create_user($username, $password) {
	$q = conn()->prepare("INSERT INTO users (username, password) VALUES (:u, :p)");
	$q->execute([":u" => $username, ":p" => password_hash($password, PASSWORD_DEFAULT)]);
	return conn()->lastInsertId();
}

function create_session($user_id) {
	$token = bin2hex(random_bytes(32));
	$q = conn()->prepare("INSERT INTO sessions (token, user_id) VALUES (:t, :u)");
	$q->execute([":t" => $token, ":u" => $user_id]);
	return $token;
}

function user_by_session($token) {
	if (!$token) return null;
	$q = conn()->prepare("SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = :t");
	$q->execute([":t" => $token]);
	return $q->fetch(\PDO::FETCH_ASSOC) ?: null;
}

function delete_session($token) {
	conn()->prepare("DELETE FROM sessions WHERE token = :t")->execute([":t" => $token]);
}

function load_scene($user_id) {
	$q = conn()->prepare("SELECT data FROM scenes WHERE user_id = :u");
	$q->execute([":u" => $user_id]);
	$data = $q->fetchColumn();
	return $data === false ? null : $data;
}

function save_scene($user_id, $data) {
	$q = conn()->prepare("INSERT INTO scenes (user_id, data, updated) VALUES (:u, :d, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data = :d, updated = CURRENT_TIMESTAMP");
	$q->execute([":u" => $user_id, ":d" => $data]);
}

function load_library($user_id) {
	$q = conn()->prepare("SELECT data FROM libraries WHERE user_id = :u");
	$q->execute([":u" => $user_id]);
	$data = $q->fetchColumn();
	return $data === false ? null : $data;
}

function save_library($user_id, $data) {
	$q = conn()->prepare("INSERT INTO libraries (user_id, data, updated) VALUES (:u, :d, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data = :d, updated = CURRENT_TIMESTAMP");
	$q->execute([":u" => $user_id, ":d" => $data]);
}
