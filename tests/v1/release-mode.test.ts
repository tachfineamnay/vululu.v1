import {afterEach,expect,it,vi} from 'vitest';
import {requireDemo} from '../../apps/api/src/releaseMode';
afterEach(()=>vi.unstubAllEnvs());
it('disables demo writes unless the production operator explicitly enables them',async()=>{
  vi.stubEnv('APP_ENV','production');vi.stubEnv('DEMO_MODE','0');
  await expect(requireDemo()).rejects.toMatchObject({code:'demo_disabled'});
  vi.stubEnv('DEMO_MODE','1');await expect(requireDemo()).resolves.toBeUndefined();
});
