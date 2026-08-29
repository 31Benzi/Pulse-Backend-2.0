const activeIps = new Map<string, number>();
const ACTIVITY_TIMEOUT = 60 * 1000;

export function trackActiveIp(ip: string): void {
    if (ip === "unknown") return;
    activeIps.set(ip, Date.now());
}

export function getActivePlayerCount(): number {
    const now = Date.now();
    let count = 0;
    for (const [ip, lastSeen] of activeIps.entries()) {
        if (now - lastSeen < ACTIVITY_TIMEOUT) {
            count++;
        } else {
            activeIps.delete(ip);
        }
    }
    return count;
}

export function cleanupInactiveIps(): void {
    const now = Date.now();
    for (const [ip, lastSeen] of activeIps.entries()) {
        if (now - lastSeen >= ACTIVITY_TIMEOUT) {
            activeIps.delete(ip);
        }
    }
}
