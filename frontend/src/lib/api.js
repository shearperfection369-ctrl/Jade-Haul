import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("jadeos.token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});
