$ErrorActionPreference = 'Stop'
$secretBytes = New-Object byte[] 32
$random = New-Object Security.Cryptography.RNGCryptoServiceProvider
$random.GetBytes($secretBytes)
$random.Dispose()
$fixtureSecret = -join ($secretBytes | ForEach-Object { $_.ToString('x2') })

pnpm --filter @grabpic/api exec convex env set CONVEX_SERVICE_SECRET $fixtureSecret | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$convexUrlLine = Get-Content apps/api/.env.local | Where-Object { $_ -like 'CONVEX_URL=*' }
if (-not $convexUrlLine) { throw 'Local CONVEX_URL is missing' }
$env:CONVEX_URL = $convexUrlLine.Substring('CONVEX_URL='.Length)
$env:CONVEX_SERVICE_SECRET = $fixtureSecret

node tests/fixtures/verify-convex-vector.mjs
exit $LASTEXITCODE
