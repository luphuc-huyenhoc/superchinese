const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  console.log('\n=============================================================');
  console.log('   🎉 SUPERCHINESE WEB SERVER ĐANG CHẠY THÀNH CÔNG!');
  console.log('=============================================================\n');
  console.log('📱 HƯỚNG DẪN HỌC TRÊN IPHONE HOẶC ANDROID:');
  console.log('1. Đảm bảo điện thoại và máy tính kết nối CÙNG MẠNG WIFI.');
  console.log('2. Mở trình duyệt trên điện thoại (Safari trên iPhone, Chrome trên Android).');
  console.log('3. Nhập một trong các địa chỉ sau vào thanh tìm kiếm:\n');
  ips.forEach(ip => {
    console.log(`   👉  http://${ip}:${PORT}`);
  });
  console.log('\n💡 Mẹo biến thành App toàn màn hình trên điện thoại:');
  console.log('   - Trên iPhone (Safari): Bấm nút Chia sẻ (biểu tượng mũi tên) -> "Thêm vào MH chính" (Add to Home Screen)');
  console.log('   - Trên Android (Chrome): Bấm 3 chấm góc phải -> "Cài đặt ứng dụng" hoặc "Thêm vào Màn hình chính"');
  console.log('\n(Để tắt máy chủ, nhấn Ctrl + C trên cửa sổ này)\n');
});
