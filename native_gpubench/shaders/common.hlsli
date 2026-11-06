// Shared by every pass. Integer scene math mirrors sceneModel.js.
#pragma pack_matrix(row_major)
#define GRID 64u
#define CELL 64u
#define WIDTH 2560u
#define HEIGHT 1440u
#define TILE 16u
#define TILES_X (WIDTH / TILE)
#define ID_GROUND 0xfffffffeu
#define ID_SKY 0xffffffffu

cbuffer Frame : register(b0)
{
    float4x4 viewProj;
    float4x4 sunViewProj;
    float4 eye;
    float4 fwd;
    float4 right;
    float4 up;
    float4 sunDir; // towards the sun
    uint seed;
    uint frame;
    uint pad0;
    uint pad1;
};

uint pcg(uint x)
{
    uint state = x * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
uint hash2(uint a, uint b) { return pcg(pcg(a) ^ b); }
uint tri(uint t, uint period) { uint p = t % period; return p < period / 2u ? p : period - p; }

void boxAt(uint index, out float3 bmin, out float3 bmax)
{
    uint cx = index % GRID, cz = index / GRID;
    uint h = hash2(seed, index);
    uint halfW = 12u + (h & 15u);
    uint base = 40u + ((h >> 4u) & 255u);
    uint period = 2u * (120u + ((h >> 12u) & 127u));
    uint height = base + tri(frame + ((h >> 20u) & 1023u), period);
    uint x = cx * CELL + CELL / 2u, z = cz * CELL + CELL / 2u;
    bmin = float3(x - halfW, 0, z - halfW);
    bmax = float3(x + halfW, height, z + halfW);
}

float3 pixelRay(uint2 p)
{
    const float tanHalf = 0.5;
    float sx = ((p.x + 0.5) / WIDTH * 2.0 - 1.0) * tanHalf * (float(WIDTH) / float(HEIGHT));
    float sy = (1.0 - (p.y + 0.5) / HEIGHT * 2.0) * tanHalf;
    return normalize(fwd.xyz + right.xyz * sx + up.xyz * sy);
}

// Ray against a box: entry distance and outward normal.
float hitBox(float3 o, float3 d, float3 bmin, float3 bmax, out float3 n)
{
    float3 inv = 1.0 / d;
    float3 a = (bmin - o) * inv, b = (bmax - o) * inv;
    float3 lo = min(a, b);
    float t0 = max(lo.x, max(lo.y, lo.z));
    n = t0 == lo.x ? float3(-sign(d.x), 0, 0) : t0 == lo.y ? float3(0, -sign(d.y), 0) : float3(0, 0, -sign(d.z));
    return t0;
}

// DarkHub "Frost" identity (docs/DESIGN.md), as linear RGB: Ink neutrals, Glacier as the one accent, Snow for highlights.
static const float3 INK = float3(0.0045, 0.0055, 0.0075);
static const float3 INK_RAISED = float3(0.020, 0.024, 0.031);
static const float3 GLACIER = float3(0.27, 0.65, 0.87);
static const float3 GLACIER_DEEP = float3(0.03, 0.19, 0.33);
static const float3 SNOW = float3(0.90, 0.93, 0.96);
static const float3 MOON = float3(1.05, 1.25, 1.55);

// The logo's snowflake as a distance field; arms reach about 1. Six-fold: folds any point into one half arm.
float snowflake(float2 p)
{
    const float sector = 1.0471976;
    float a = abs(frac(atan2(p.y, p.x) / sector + 0.5) - 0.5) * sector;
    float2 q = length(p) * float2(cos(a), sin(a));
    float arm = length(q - float2(clamp(q.x, 0.0, 0.72), 0)) - 0.09;
    float knob = length(q - float2(0.80, 0)) - 0.14;
    float2 b0 = float2(0.46, 0), b1 = float2(0.60, 0.20);
    float t = saturate(dot(q - b0, b1 - b0) / dot(b1 - b0, b1 - b0));
    float branch = length(q - b0 - (b1 - b0) * t) - 0.075;
    return min(arm, min(knob, branch));
}

// Procedural surfaces. The window loop is ALU heavy on purpose, the same in both tests.
float3 material(uint id, float3 p, float3 n, out float3 emissive)
{
    emissive = 0;
    if (id == ID_GROUND)
    {
        // streets run along the cell borders, boxes sit in the cell centres
        float2 g = abs(frac(p.xz / CELL) - 0.5);
        float line_ = smoothstep(0.488, 0.497, max(g.x, g.y));
        emissive = GLACIER_DEEP * line_ * 2.2 * exp(-length(p - eye.xyz) * 0.0007);
        return INK_RAISED;
    }
    uint h = pcg(id ^ seed);
    float shade = 0.75 + 0.5 * float(h & 255u) / 255.0; // brightness only: no colour per building
    float3 a, b;
    boxAt(id, a, b);
    if (n.y > 0.5)
    {
        // frosted roof, a glacier rim, and the logo on one roof in four
        float2 c = (a.xz + b.xz) * 0.5, halfW = (b.xz - a.xz) * 0.5;
        float2 e = halfW - abs(p.xz - c);
        emissive = GLACIER * 1.4 * (1.0 - smoothstep(0.5, 1.3, min(e.x, e.y)));
        if ((h >> 8u & 3u) == 0u)
        {
            float2 uv = (p.xz - c) / halfW.x * 1.2;
            float d = snowflake(uv);
            emissive += SNOW * 1.5 * (1.0 - smoothstep(0.0, 0.03, d));
            emissive += GLACIER * 2.2 * (1.0 - smoothstep(0.17, 0.20, length(uv)));
        }
        return INK_RAISED * 2.5 * shade;
    }
    if (n.y < -0.5) return INK;
    float2 uv = abs(n.x) > 0.5 ? p.zy : p.xy;
    float2 cell = floor(uv / float2(6, 9));
    float2 f = frac(uv / float2(6, 9));
    float acc = 0;
    [unroll] for (int i = 1; i <= 6; i++) acc += sin(uv.x * 0.07 * i + i) * cos(uv.y * 0.05 * i) / i;
    float win = step(0.20, f.x) * step(f.x, 0.80) * step(0.25, f.y) * step(f.y, 0.75);
    uint wh = hash2(h, uint(cell.x) * 131u + uint(cell.y));
    float lit = (wh & 3u) == 0u ? 1.0 : 0.0;
    float3 glow = (wh >> 2u & 7u) == 0u ? SNOW * 1.5 : GLACIER * 1.1;
    emissive = win * lit * glow * (1.0 + 0.25 * acc);
    emissive += GLACIER * 0.9 * (1.0 - smoothstep(0.4, 1.2, b.y - p.y)); // cold line along the top of each wall
    return lerp(INK_RAISED * shade * (1.0 + 0.15 * acc), INK, win);
}

float3 sky(float3 d)
{
    float glow = exp(-max(d.y, 0.0) * 9.0);
    float moon = smoothstep(0.99955, 0.9997, dot(d, sunDir.xyz));
    float halo = pow(saturate(dot(d, sunDir.xyz)), 90.0);
    return INK * 1.3 + GLACIER_DEEP * 0.22 * glow + GLACIER * 0.10 * halo + SNOW * 5.0 * moon;
}
