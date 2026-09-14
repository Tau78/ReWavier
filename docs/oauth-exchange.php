<?php
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  http_response_code(405);
  echo json_encode(['error' => 'method']);
  exit;
}

$secretFile = dirname(__DIR__) . '/.rewavier-oauth-secret.php';
if (!is_readable($secretFile)) {
  http_response_code(503);
  echo json_encode(['error' => 'server']);
  exit;
}

$secret = require $secretFile;
if (!is_string($secret) || $secret === '') {
  http_response_code(503);
  echo json_encode(['error' => 'server']);
  exit;
}

$desktop = '1049963169218-k8i1dmlbsn1nqrv393u8pp111v7v2efc.apps.googleusercontent.com';
$redirect = 'com.googleusercontent.apps.1049963169218-k8i1dmlbsn1nqrv393u8pp111v7v2efc:/oauthredirect';

$clientId = (string) ($_POST['client_id'] ?? '');
$grant = (string) ($_POST['grant_type'] ?? 'authorization_code');

if ($clientId !== $desktop) {
  http_response_code(400);
  echo json_encode(['error' => 'client']);
  exit;
}

$body = [
  'client_id' => $desktop,
  'client_secret' => $secret,
  'grant_type' => $grant,
];

if ($grant === 'authorization_code') {
  $code = (string) ($_POST['code'] ?? '');
  $redirectUri = (string) ($_POST['redirect_uri'] ?? '');
  $verifier = (string) ($_POST['code_verifier'] ?? '');
  if ($code === '' || $redirectUri !== $redirect || $verifier === '') {
    http_response_code(400);
    echo json_encode(['error' => 'request']);
    exit;
  }
  $body['code'] = $code;
  $body['redirect_uri'] = $redirectUri;
  $body['code_verifier'] = $verifier;
} elseif ($grant === 'refresh_token') {
  $refresh = (string) ($_POST['refresh_token'] ?? '');
  if ($refresh === '') {
    http_response_code(400);
    echo json_encode(['error' => 'request']);
    exit;
  }
  $body['refresh_token'] = $refresh;
} else {
  http_response_code(400);
  echo json_encode(['error' => 'grant']);
  exit;
}

$ch = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query($body),
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 20,
]);
$raw = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($raw === false) {
  http_response_code(502);
  echo json_encode(['error' => 'google']);
  exit;
}

http_response_code($status >= 100 ? $status : 502);
echo $raw;
