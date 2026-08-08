$size = 512MB
$path = "test-512mb.txt"
$chunk = [Text.Encoding]::ASCII.GetBytes(("A" * 1MB))
$stream = [System.IO.File]::Create($path)

try {
    $written = 0
    while ($written -lt $size) {
        $toWrite = [Math]::Min($chunk.Length, $size - $written)
        $stream.Write($chunk, 0, $toWrite)
        $written += $toWrite
    }
} finally {
    $stream.Close()
}

Write-Host "Created $path ($size bytes)"
