// src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // proxied to :8000 by setupProxy.js (CRA)
  headers: { Accept: 'application/json' },
  // withCredentials: true, // uncomment if you need cookies
});

export default api;
