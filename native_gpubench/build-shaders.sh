#!/usr/bin/env bash
# Compiles the shaders to DXIL. Output is committed, so building the engine does not need the Windows SDK.
set -e
cd "$(dirname "$0")"
DXC="/c/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/dxc.exe"
mkdir -p shaders/out
compile() { "$DXC" -nologo -HV 2021 -O3 -T "$1" -E "$2" -Fo "shaders/out/$3.dxil" "shaders/$4.hlsl"; }
compile vs_6_5 vs vis_vs vis
compile ps_6_5 ps vis_ps vis
compile vs_6_5 vsShadow shadow_vs vis
compile cs_6_5 csGround ground vis
compile cs_6_5 cs shade shade
compile cs_6_5 cs rt rt
compile cs_6_5 csTiles tiles post
compile cs_6_5 csTone tone post
ls -la shaders/out
