import { paypalLive } from '../config.js';
import { livePayPal } from './live.js';
import { mockPayPal } from './mock.js';
import type { PayPalGateway } from './gateway.js';

export const gateway: PayPalGateway = paypalLive ? livePayPal : mockPayPal;
export { mockPayPal };
