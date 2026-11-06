// Deferred shading from the visibility buffer: rebuilds position and normal analytically.
#include "common.hlsli"
Texture2D<uint> ids : register(t0);
Texture2D<float> shadow : register(t1);
SamplerComparisonState shadowSmp : register(s0);
RWTexture2D<float4> hdr : register(u0);
#define LIGHTS 48u

float shadowAt(float3 p)
{
    float4 c = mul(float4(p, 1), sunViewProj);
    float2 uv = c.xy / c.w * float2(0.5, -0.5) + 0.5;
    float acc = 0;
    [unroll] for (int y = -2; y <= 2; y++)
        [unroll] for (int x = -2; x <= 2; x++)
            acc += shadow.SampleCmpLevelZero(shadowSmp, uv + float2(x, y) / 4096.0, c.z / c.w - 0.0008);
    return acc / 25.0;
}

[numthreads(8, 8, 1)]
void cs(uint3 t : SV_DispatchThreadID)
{
    uint id = ids[t.xy];
    float3 d = pixelRay(t.xy);
    if (id == ID_SKY) { hdr[t.xy] = float4(sky(d), 1); return; }
    float3 p, n;
    if (id == ID_GROUND) { p = eye.xyz + d * (-eye.y / d.y); n = float3(0, 1, 0); }
    else { float3 a, b; boxAt(id, a, b); p = eye.xyz + d * hitBox(eye.xyz, d, a, b, n); }
    float3 emissive;
    float3 alb = material(id, p, n, emissive);
    float3 c = alb * (saturate(dot(n, sunDir.xyz)) * shadowAt(p) * MOON + GLACIER_DEEP * 0.9);
    for (uint i = 0; i < LIGHTS; i++)
    {
        uint h = hash2(seed, i + 7777u);
        float3 lp = float3(h & 4095u, 30.0 + ((h >> 12u) & 127u), (h >> 19u) & 4095u);
        float3 l = lp - p;
        float dist2 = dot(l, l);
        l *= rsqrt(dist2);
        float3 col = (i & 3u) == 0u ? SNOW : GLACIER;
        c += alb * col * saturate(dot(n, l)) * (26000.0 / (dist2 + 400.0));
    }
    float fog = 1.0 - exp(-length(p - eye.xyz) * 0.00008);
    hdr[t.xy] = float4(lerp(c + emissive, sky(d) * 0.7, fog), 1);
}
