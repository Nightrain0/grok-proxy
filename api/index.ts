export const config = {
  api: {
    bodyParser: false, // 禁用 Vercel 默认的 Body 解析，直接透传流
    externalResolver: true,
  },
};

const UPSTREAM_URL = 'https://api.x.ai';

export default async function handler(req: Request) {
  // 1. 处理 CORS 预检请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      },
    });
  }

  // 2. 首页健康检查
  const url = new URL(req.url);
  if (url.pathname === '/' || url.pathname === '/api/index') {
    return new Response('Grok Proxy is running. Point your client to /v1/chat/completions', {
      status: 200,
    });
  }

  try {
    // 3. 构建上游 URL
    // 我们假设客户端请求的是 /v1/chat/completions
    // Vercel 的 rewrite 会让 req.url 保持原样，或者变成 /api/index
    // 这里我们强制修正路径
    let targetPath = url.pathname;
    
    // 如果路径被 Vercel 重写成了 /api/index，我们需要尝试恢复它，
    // 但最简单的方法是假设这个代理只用于 /v1/chat/completions
    if (targetPath === '/api/index') {
        // 如果客户端直接请求根路径转发过来的，我们默认它想访问 chat completions
        // 或者我们检查 URL search params
        targetPath = '/v1/chat/completions';
    }

    // 确保 targetPath 以 /v1 开头，如果不是（且不是 api/index），则可能需要保留
    if (!targetPath.startsWith('/v1')) {
       // 简单的容错：如果用户发了 /chat/completions，我们给它补上 /v1
       if (targetPath.startsWith('/chat')) {
         targetPath = '/v1' + targetPath;
       }
    }

    const targetUrl = new URL(targetPath + url.search, UPSTREAM_URL);

    // 4. 处理 Headers
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('content-length'); // 让 fetch 自动计算
    
    // 支持 Vercel 环境变量中的 KEY (可选)
    const envKey = process.env.GROK_API_KEY;
    if (envKey && !headers.get('Authorization')) {
      headers.set('Authorization', `Bearer ${envKey}`);
    }

    // 5. 发起请求
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
      // @ts-ignore: Vercel edge/node fetch type fix
      duplex: 'half', 
    });

    // 6. 设置响应头
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    // 移除可能引起问题的头
    responseHeaders.delete('content-encoding'); 

    // 7. 返回流式响应
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Proxy Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Proxy Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
