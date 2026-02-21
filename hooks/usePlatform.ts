const detectIsLinux = () => {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('linux');
  }
  return false;
};

// Detect platform once at module load to avoid re-render jitter
const isLinuxPlatform = detectIsLinux();

export const usePlatform = () => {
  return { isLinux: isLinuxPlatform };
};
