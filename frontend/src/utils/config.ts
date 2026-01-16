export const getApiBase = (): string => {
  // @ts-ignore
  const port = window.backend?.port;
  if (port) {
    return `http://localhost:${port}`;
  }
  return '';
};
