// PowerShell snippet that sets `$a` to the physical adapter (status Up) that carries the default IPv4 route with
// the lowest effective metric (route metric + interface metric), i.e. the one Windows really uses for internet
// traffic. Falls back to the fastest Up adapter by the numeric `Speed` (bits/s). Never sort by `LinkSpeed`: it is a
// string ("866.7 Mbps" sorts above "2.5 Gbps"). `$a` is $null when no adapter is up. ASCII only.
export const PS_SELECT_PRIMARY_ADAPTER = [
  "$dhUp = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' })",
  '$a = $null',
  "$dhRoutes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object { [int64]$_.RouteMetric + [int64]$_.InterfaceMetric })",
  'foreach ($dhR in $dhRoutes) { $a = $dhUp | Where-Object { $_.ifIndex -eq $dhR.ifIndex } | Select-Object -First 1; if ($a) { break } }',
  'if (-not $a) { $a = $dhUp | Sort-Object -Property Speed -Descending | Select-Object -First 1 }'
].join('\r\n');

export default PS_SELECT_PRIMARY_ADAPTER;
