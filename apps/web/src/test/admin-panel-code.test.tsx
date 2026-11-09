import {render,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AdminPanelCode} from '../admin/AdminPanelCode';
import type {Me} from '../admin/auth';
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:{meta:{adminHeadCode:'<script src="https://example.test/panel-sdk.js"></script>'}}})}));
afterEach(cleanup);
const me=(role:'owner'|'staff',permissions:string[]=[])=>({user:{isPlatformAdmin:false},sites:[{siteId:'cafe',role,permissions}]} as Me);
it('loads panel scripts for the owner and removes injected nodes on unmount',()=>{
 const view=render(<AdminPanelCode me={me('owner')} siteId="cafe"/>);
 expect(document.head.querySelectorAll('[data-sb-admin-head]')).toHaveLength(1);
 view.unmount();expect(document.head.querySelectorAll('[data-sb-admin-head]')).toHaveLength(0);
});
it('does not initialize for unrelated or non-order staff',()=>{
 const view=render(<AdminPanelCode me={me('staff')} siteId="cafe"/>);expect(document.head.querySelectorAll('[data-sb-admin-head]')).toHaveLength(0);
 view.rerender(<AdminPanelCode me={me('owner')} siteId="other"/>);expect(document.head.querySelectorAll('[data-sb-admin-head]')).toHaveLength(0);
 view.rerender(<AdminPanelCode me={me('staff',['orders:read'])} siteId="cafe"/>);expect(document.head.querySelectorAll('[data-sb-admin-head]')).toHaveLength(1);
});
