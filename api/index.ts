export const config = {
  runtime: 'edge', // 使用 Edge Runtime 降低延迟
  regions: ['iad1', 'sfo1', 'hnd1', 'sin1'], // 可选：指定部署区域
};

const UPSTREAM_URL = 'https://api.x.ai'; // Grok 的 API 地址

export default async function handler(req: Request) {
  const url = new URL(req.url);
  
  // 1. 处理 CORS (如果是 OPTIONS 请求，直接返回允许)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 2. 简单的首页欢迎信息
  if (url.pathname === '/' || url.pathname === '/api/index') {
     return new Response(`Grok Proxy is running. \nUse /v1/chat/completions as your base URL.`, {
      status: 200,
    });
  }

  try {
    // 3. 构建上游请求 URL
    // 从请求路径中提取 /v1/... 部分。Vercel rewrite 后 pathname 可能是 /api/index，我们需要原始路径
    // 这里简单处理：假设客户端请求的是 /v1/chat/completions，我们拼接到 UPSTREAM_URL 后
    // 注意：如果通过 vercel.json rewrite，req.url 可能是重写后的，这里我们利用 path 修正
    let targetPath = url.pathname;
    if (targetPath.startsWith('/api/index')) {
        // 尝试从 search params 或者原始 URL 恢复，或者简单地默认透传
        // 在 Vercel Edge 中，rewrites 后的 req.url 通常保留原始路径
        // 如果这里遇到路径问题，可以根据实际情况调整
    }
    
    // 修正：确保路径以 /v1 开头 (xAI 的 API 是 /v1/chat/completions)
    if (!targetPath.startsWith('/v1')) {
         // 如果路径不是 /v1 开头，可能需要调整，或者直接透传
    }

    const targetUrl = new URL(targetPath + url.search, UPSTREAM_URL);

    // 4. 处理 Headers
    const headers = new Headers(req.headers);
    headers.delete('host'); // 删除 host，让 fetch 自动设置
    headers.delete('connection');
    
    // 支持在 Vercel 环境变量中配置 GROK_API_KEY，也可以从客户端传 Authorization
    const envKey = process.env.GROK_API_KEY;
    if (envKey && !headers.get('Authorization')) {
      headers.set('Authorization', `Bearer ${envKey}`);
    }

    // 5. 转发请求
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: req.body, // 直接透传请求体（流）
      redirect: 'follow',
    });

    // 6. 处理响应 Headers
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // 再次确保 CORS
    
    // 7. 返回响应 (直接透传 body 流)
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}