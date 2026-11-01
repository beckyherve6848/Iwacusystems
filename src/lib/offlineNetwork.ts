let apiNetworkAvailable = true;

export function setApiNetworkAvailable(isAvailable: boolean) {
  apiNetworkAvailable = isAvailable;
}

export function isNetworkAvailable() {
  return typeof navigator === 'undefined' || (navigator.onLine && apiNetworkAvailable);
}
