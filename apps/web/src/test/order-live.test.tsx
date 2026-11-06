import {act,renderHook} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useOrderLive} from '../admin/interactions/useOrderLive';
vi.mock('../lib/api',()=>({API_URL:'http://test.local'}));
class Stream{
  static all:Stream[]=[];
  onopen:(()=>void)|null=null;
  onerror:(()=>void)|null=null;
  changed:()=>void=()=>{};
  close=vi.fn();
  constructor(public url:string,public options:unknown){Stream.all.push(this);}
  addEventListener(name:string,cb:()=>void){if(name==='changed')this.changed=cb;}
}
beforeEach(()=>{Stream.all=[];vi.useFakeTimers();vi.stubGlobal('EventSource',Stream);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('uses one credentialed stream and refreshes cached orders only after coalesced change events',()=>{
  const qc=new QueryClient();
  const refresh=vi.spyOn(qc,'invalidateQueries').mockResolvedValue();
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useOrderLive('cafe'),{wrapper});
  const stream=Stream.all[0];
  expect(stream.url).toBe('http://test.local/api/v1/sites/cafe/orders/live');
  expect(stream.options).toEqual({withCredentials:true});
  act(()=>{stream.onopen?.();});expect(hook.result.current).toBe(true);
  act(()=>vi.advanceTimersByTime(60000));expect(refresh).not.toHaveBeenCalled();
  act(()=>{stream.changed();stream.changed();stream.changed();vi.advanceTimersByTime(200);});
  expect(refresh).toHaveBeenCalledExactlyOnceWith({queryKey:['site','cafe','orders']});
  act(()=>{stream.onerror?.();});expect(hook.result.current).toBe(false);
  hook.unmount();expect(stream.close).toHaveBeenCalledOnce();
});
it('clears queued refreshes when leaving the orders page',()=>{
  const qc=new QueryClient(),refresh=vi.spyOn(qc,'invalidateQueries').mockResolvedValue();
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useOrderLive('cafe'),{wrapper});
  act(()=>Stream.all[0].changed());
  hook.unmount();
  act(()=>vi.advanceTimersByTime(1000));
  expect(refresh).not.toHaveBeenCalled();
});
