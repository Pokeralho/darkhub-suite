// Visibility pass. Every box face is subdivided (same plane, so silhouettes do not change) to load the geometry pipeline.
#include "common.hlsli"
#define SUB 16u
struct VSOut { float4 pos : SV_Position; nointerpolation uint id : ID; };

float3 faceVertex(uint vid, float3 bmin, float3 bmax)
{
    uint perFace = SUB * SUB * 6u;
    uint face = vid / perFace, q = (vid % perFace) / 6u, c = vid % 6u;
    const uint2 corner[6] = { uint2(0, 0), uint2(0, 1), uint2(1, 0), uint2(1, 0), uint2(0, 1), uint2(1, 1) };
    float2 uv = (float2(q % SUB, q / SUB) + float2(corner[c])) / SUB;
    float3 p;
    switch (face)
    {
        case 0: p = float3(1, uv.x, uv.y); break;
        case 1: p = float3(0, uv.x, uv.y); break;
        case 2: p = float3(uv.x, 1, uv.y); break;
        case 3: p = float3(uv.x, 0, uv.y); break;
        case 4: p = float3(uv.x, uv.y, 1); break;
        default: p = float3(uv.x, uv.y, 0); break;
    }
    return bmin + p * (bmax - bmin);
}

VSOut vs(uint vid : SV_VertexID, uint iid : SV_InstanceID)
{
    float3 bmin, bmax;
    boxAt(iid, bmin, bmax);
    VSOut o;
    o.pos = mul(float4(faceVertex(vid, bmin, bmax), 1), viewProj);
    o.id = iid;
    return o;
}

// id + 1: the target clears to 0, a float clear value cannot hold 0xffffffff exactly
uint ps(VSOut i) : SV_Target { return i.id + 1u; }

float4 vsShadow(uint vid : SV_VertexID, uint iid : SV_InstanceID) : SV_Position
{
    float3 bmin, bmax;
    boxAt(iid, bmin, bmax);
    return mul(float4(faceVertex(vid, bmin, bmax), 1), sunViewProj);
}

// The ground is not geometry in the ID image: pixels the boxes leave empty are resolved here to ground or sky.
RWTexture2D<uint> idsRw : register(u0);
[numthreads(8, 8, 1)]
void csGround(uint3 t : SV_DispatchThreadID)
{
    uint v = idsRw[t.xy];
    idsRw[t.xy] = v != 0u ? v - 1u : pixelRay(t.xy).y < 0 ? ID_GROUND : ID_SKY;
}
