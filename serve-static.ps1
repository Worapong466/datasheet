param([int]$Port = 8791)

$folder = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $folder on http://localhost:$Port/"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
    try {
        $relPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
        $filePath = Join-Path $folder $relPath
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($filePath -like "*.html") { $res.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath -like "*.css") { $res.ContentType = "text/css; charset=utf-8" }
            elseif ($filePath -like "*.js") { $res.ContentType = "text/javascript; charset=utf-8" }
            elseif ($filePath -like "*.json") { $res.ContentType = "application/json; charset=utf-8" }
            elseif ($filePath -like "*.png") { $res.ContentType = "image/png" }
            elseif ($filePath -like "*.pdf") { $res.ContentType = "application/pdf" }
            elseif ($filePath -like "*.csv") { $res.ContentType = "text/csv; charset=utf-8" }
            else { $res.ContentType = "application/octet-stream" }
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $relPath")
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
    } catch {
        $res.StatusCode = 500
    } finally {
        $res.OutputStream.Close()
    }
}
