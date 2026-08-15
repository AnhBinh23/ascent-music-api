module.exports = (err, req, res, _next) => {
  console.error(`❌ [${req.method} ${req.originalUrl}]`, err.stack || err.message);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'CORS: Origin không được phép' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File quá lớn!' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Field upload không hợp lệ!' });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Dữ liệu đã tồn tại!' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(400).json({ success: false, message: 'Không thể thao tác do ràng buộc dữ liệu!' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Body JSON không hợp lệ!' });
  }

  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'Có lỗi xảy ra, vui lòng thử lại!',
  });
};
