// Tile hashes (the commitment), then glow and tone map.
#include "common.hlsli"
Texture2D<uint> ids : register(t0);
Texture2D<float4> hdr : register(t1);
RWStructuredBuffer<uint> tileHashes : register(u0);
RWTexture2D<float4> ldr : register(u1);

// One thread per tile. The fold is row by row, as tileHash() in sceneModel.js.
[numthreads(64, 1, 1)]
void csTiles(uint3 t : SV_DispatchThreadID)
{
    uint tiles = TILES_X * (HEIGHT / TILE);
    if (t.x >= tiles) return;
    uint2 base = uint2(t.x % TILES_X, t.x / TILES_X) * TILE;
    uint h = 2166136261u;
    for (uint y = 0; y < TILE; y++)
        for (uint x = 0; x < TILE; x++)
            h = pcg(h ^ ids[base + uint2(x, y)]);
    tileHashes[t.x] = h;
}

[numthreads(8, 8, 1)]
void csTone(uint3 t : SV_DispatchThreadID)
{
    float3 c = hdr[t.xy].rgb, glow = 0;
    [unroll] for (int y = -3; y <= 3; y++)
        [unroll] for (int x = -3; x <= 3; x++)
        {
            float3 s = hdr[clamp(int2(t.xy) + int2(x, y) * 3, int2(0, 0), int2(WIDTH - 1, HEIGHT - 1))].rgb;
            glow += max(s - 1.0, 0);
        }
    c = (c + glow / 49.0 * 1.6) * 1.15;
    c = c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14); // filmic curve
    float2 v = (float2(t.xy) + 0.5) / float2(WIDTH, HEIGHT) - 0.5;
    c *= 1.0 - dot(v, v) * 0.7; // vignette
    c = pow(saturate(c), 1.0 / 2.2);

    // The DarkHub seal in the corner, so every capture carries the brand: octagon, snowflake, glacier centre.
    const float radius = 58.0;
    float2 q = (float2(t.xy) + 0.5 - float2(WIDTH - 96.0, HEIGHT - 96.0)) / radius;
    float2 aq = abs(q);
    float oct = max(max(aq.x, aq.y), (aq.x + aq.y) * 0.7071);
    float px = 1.0 / radius;
    float3 seal = lerp(float3(0.17, 0.19, 0.23), float3(0.05, 0.06, 0.08), 1.0 - smoothstep(0.88, 0.88 + px, oct));
    float flake = snowflake(q * 1.35);
    seal = lerp(seal, float3(0.94, 0.96, 0.98), 1.0 - smoothstep(0.0, px * 1.35, flake));
    seal = lerp(seal, float3(0.56, 0.83, 0.94), 1.0 - smoothstep(0.17, 0.17 + px, length(q)));
    c = lerp(c, seal, (1.0 - smoothstep(1.0 - px, 1.0, oct)) * 0.95);
    ldr[t.xy] = float4(c, 1);
}
