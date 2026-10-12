export type PrintDocumentType = 'report' | 'receipt' | 'agreement' | 'invoice' | 'staff-card';

export function printDocument(type: PrintDocumentType, targetId: string) {
  const className = `printing-${type}`;
  const target = document.getElementById(targetId);
  if (!target) {
    throw new Error(`Cannot print ${type}: document "${targetId}" was not found.`);
  }

  const originalParent = target.parentNode;
  const originalNextSibling = target.nextSibling;
  if (!originalParent) {
    throw new Error(`Cannot print ${type}: document "${targetId}" is detached.`);
  }

  document.body.classList.add('printing-document', className);
  document.body.dataset.printTarget = targetId;
  target.classList.add('print-selected');
  document.body.appendChild(target);

  let cleanedUp = false;
  let cleanupTimer = 0;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    document.body.classList.remove('printing-document', className);
    delete document.body.dataset.printTarget;
    target.classList.remove('print-selected');
    if (originalNextSibling?.parentNode === originalParent) {
      originalParent.insertBefore(target, originalNextSibling);
    } else {
      originalParent.appendChild(target);
    }
    window.removeEventListener('afterprint', cleanup);
    window.clearTimeout(cleanupTimer);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
  cleanupTimer = window.setTimeout(cleanup, 60_000);
}
