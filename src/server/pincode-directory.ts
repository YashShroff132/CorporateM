/**
 * Launch-time serviceable pincode directory.
 *
 * The Checkout_Service and COD gating depend on an injected
 * {@link PincodeDirectory} (see `services/checkout`). At launch there is no
 * external serviceability API, so we seed a small owner-configured in-memory
 * directory of major Indian pincodes. This lets pincode autofill and
 * serviceability work deterministically without a network call and without a
 * live database. The Shipping_Service aggregator (behind a feature flag) can
 * replace this later without changing checkout callers.
 */

import {
  createInMemoryPincodeDirectory,
  type PincodeDirectory,
  type PincodeLocation,
} from '@/services/checkout';

/**
 * A handful of well-known serviceable Indian pincodes and their locations.
 * Keys must be valid 6-digit pincodes (not starting with 0); the directory
 * factory ignores any malformed entry defensively.
 */
export const SEED_PINCODES: Readonly<Record<string, PincodeLocation>> = {
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', state: 'West Bengal' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '226001': { city: 'Lucknow', state: 'Uttar Pradesh' },
};

/** The shared serviceable pincode directory used across checkout + payment. */
export const pincodeDirectory: PincodeDirectory =
  createInMemoryPincodeDirectory(SEED_PINCODES);
