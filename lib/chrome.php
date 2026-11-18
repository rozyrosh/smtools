<?php
declare(strict_types=1);

function chrome_head(string $title): void
{
    $csrf = htmlspecialchars(csrf_token(), ENT_QUOTES);
    $title = htmlspecialchars($title, ENT_QUOTES);
    echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="{$csrf}">
  <meta name="robots" content="noindex">
  <title>{$title}</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='7' y='7' width='18' height='18' fill='none' stroke='%23d23b2e' stroke-width='3'/%3E%3Cpath d='M16 2v8M16 22v8M2 16h8M22 16h8' stroke='%23d23b2e' stroke-width='3'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Literata:opsz,wght@7..72,500;7..72,700&family=Syne:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/app.css?v=12">
</head>
<body>

HTML;
}

function chrome_nav(?array $user, string $active): void
{
    $csrf = htmlspecialchars(csrf_token(), ENT_QUOTES);
    echo '<nav class="bar">';
    echo '<a class="bar-brand" href="' . ($user ? 'desk.php' : 'index.php') . '"><span class="mark-logo" aria-hidden="true"></span>smtools</a>';
    if ($user) {
        echo '<div class="bar-links">';
        echo '<a href="desk.php"' . ($active === 'desk' ? ' class="on" aria-current="page"' : '') . '>Page Desk</a>';
        echo '<a href="video.php"' . ($active === 'video' ? ' class="on" aria-current="page"' : '') . '>Video desk</a>';
        echo '</div>';
        $name = htmlspecialchars((string) ($user['name'] ?? ''), ENT_QUOTES);
        echo '<div class="bar-account"><span>' . $name . '</span>';
        echo '<form method="post" action="logout.php"><input type="hidden" name="csrf" value="' . $csrf . '"><button type="submit" class="btn text">Log out</button></form>';
        echo '</div>';
    } else {
        echo '<div class="bar-account">';
        echo '<a class="btn text" href="login.php">Log in</a>';
        echo '<a class="btn stamp" href="register.php">Open a desk</a>';
        echo '</div>';
    }
    echo '</nav>';
}
