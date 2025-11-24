export const config = {
  runtime: 'edge', // 显式指定使用 Edge Runtime
  // regions: ['iad1'], // 可选：如果需要固定区域可取消注释
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

  const url = new URL(req.url);

  // 2. 首页健康检查
  if (url.pathname === '/' || url.pathname === '/api/index') {
    return new Response('Grok Proxy is running (Edge Runtime). Point your client to /v1/chat/completions', {
      status: 200,
    });
  }

  try {
    // 3. 构建上游 URL
    let targetPath = url.pathname;
    
    // 修正 Vercel rewrite 带来的路径问题
    if (targetPath === '/api/index') {
        targetPath = '/v1/chat/completions';
    }

    // 简单的路径容错
    if (!targetPath.startsWith('/v1')) {
       if (targetPath.startsWith('/chat')) {
         targetPath = '/v1' + targetPath;
       }
    }

    const targetUrl = new URL(targetPath + url.search, UPSTREAM_URL);

    // 4. 处理 Headers
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.delete('content-length');
    headers.delete('connection');
    headers.delete('accept-encoding'); // 避免上游返回压缩数据导致透传出错
    
    // 支持 Vercel 环境变量中的 KEY
    const envKey = process.env.GROK_API_KEY;
    if (envKey && !headers.get('Authorization')) {
      headers.set('Authorization', `Bearer ${envKey}`);
    }

    // 5. 发起请求
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
      redirect: 'follow',
    });

    // 6. 设置响应头
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
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
