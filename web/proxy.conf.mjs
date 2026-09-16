export default {
  '/ws': {
    target: 'ws://localhost:8080',
    ws: true,
    secure: false,
  },
  '/playmats': {
    target: 'http://localhost:8080',
    secure: false,
  },
};
