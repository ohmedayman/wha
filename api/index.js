const server = require('./server');

module.exports = (req, res) => {
    const url = req.url || '';
    if (url === '/' || url === '' || url === '/index.html' || url.startsWith('/?')) {
        res.writeHead(302, { Location: '/admin' });
        return res.end();
    }
    return server(req, res);
};