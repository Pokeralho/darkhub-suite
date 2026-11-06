// Inline ray tracing (DXR 1.1): primary hits fill the same ID image, then a short path traced estimate per pixel.
#include "common.hlsli"
RaytracingAccelerationStructure tlas : register(t0);
RWTexture2D<uint> ids : register(u0);
RWTexture2D<float4> hdr : register(u1);
#define SPP 4u
#define BOUNCES 4u

bool trace(float3 o, float3 d, out uint id, out float t, out float3 n)
{
    RayQuery<RAY_FLAG_FORCE_OPAQUE> q;
    RayDesc r;
    r.Origin = o; r.Direction = d; r.TMin = 0.01; r.TMax = 1e7;
    q.TraceRayInline(tlas, RAY_FLAG_NONE, 0xFF, r);
    q.Proceed();
    float groundT = d.y < 0 ? -o.y / d.y : 1e30;
    if (q.CommittedStatus() == COMMITTED_TRIANGLE_HIT && q.CommittedRayT() <= groundT)
    {
        id = q.CommittedInstanceID();
        t = q.CommittedRayT();
        float3 a, b;
        boxAt(id, a, b);
        float3 p = o + d * t;
        float3 e = min(abs(p - a), abs(p - b));
        n = e.x < e.y && e.x < e.z ? float3(sign(p.x - (a.x + b.x) * 0.5), 0, 0)
          : e.y < e.z ? float3(0, 1, 0) : float3(0, 0, sign(p.z - (a.z + b.z) * 0.5));
        return true;
    }
    if (groundT < 1e30) { id = ID_GROUND; t = groundT; n = float3(0, 1, 0); return true; }
    id = ID_SKY; t = 0; n = 0;
    return false;
}

float rnd(inout uint s) { s = pcg(s); return s / 4294967296.0; }
float3 cosine(float3 n, inout uint s)
{
    float a = rnd(s) * 6.2831853, z = rnd(s) * 2 - 1, r = sqrt(max(0, 1 - z * z));
    return normalize(n + float3(r * cos(a), r * sin(a), z) * 0.999);
}

[numthreads(8, 8, 1)]
void cs(uint3 t : SV_DispatchThreadID)
{
    float3 d0 = pixelRay(t.xy);
    uint id0; float t0; float3 n0;
    bool hit0 = trace(eye.xyz, d0, id0, t0, n0);
    ids[t.xy] = id0;
    if (!hit0) { hdr[t.xy] = float4(sky(d0), 1); return; }
    float3 sum = 0;
    for (uint s = 0; s < SPP; s++)
    {
        uint rng = hash2(t.y * WIDTH + t.x, frame * SPP + s);
        float3 o = eye.xyz + d0 * t0, n = n0, thr = 1, c = 0;
        uint id = id0;
        for (uint b = 0; b < BOUNCES; b++)
        {
            float3 emissive;
            float3 alb = material(id, o, n, emissive);
            c += thr * emissive;
            uint si; float st; float3 sn;
            float ndl = saturate(dot(n, sunDir.xyz));
            if (ndl > 0 && !trace(o + n * 0.05, sunDir.xyz, si, st, sn)) c += thr * alb * ndl * MOON;
            thr *= alb;
            float3 d = cosine(n, rng);
            float tn;
            if (!trace(o + n * 0.05, d, id, tn, sn)) { c += thr * sky(d); break; }
            o += n * 0.05 + d * tn;
            n = sn;
        }
        sum += c;
    }
    float fog = 1.0 - exp(-t0 * 0.00008);
    hdr[t.xy] = float4(lerp(sum / SPP, sky(d0) * 0.7, fog), 1);
}
