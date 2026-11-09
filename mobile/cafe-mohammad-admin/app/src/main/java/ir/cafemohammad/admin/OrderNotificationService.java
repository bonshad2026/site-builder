package ir.cafemohammad.admin;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import android.webkit.CookieManager;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;

/** User-started, visible live-order monitor. It never runs in the customer application. */
public class OrderNotificationService extends Service {
    static final String ORIGIN="https://cafemohammad.tibasoft.ir";
    static final String BASE="/api/v1/sites/cafe-mohammad/orders";
    static final String STOP="ir.cafemohammad.admin.STOP_ORDERS";
    private static final String STATE="order_monitor",ALERTS="new_orders",SERVICE="order_monitor_status";
    private volatile boolean running;
    private volatile HttpURLConnection active;
    private Thread worker;
    private android.content.SharedPreferences prefs;
    private NotificationManager manager;
    private PowerManager.WakeLock wake;
    private volatile String cookie;
    @Override public void onCreate(){
        super.onCreate();prefs=getSharedPreferences(STATE,MODE_PRIVATE);manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel status=new NotificationChannel(SERVICE,"وضعیت دریافت سفارش‌ها",NotificationManager.IMPORTANCE_LOW);manager.createNotificationChannel(status);
            NotificationChannel alerts=new NotificationChannel(ALERTS,"سفارش‌های جدید",NotificationManager.IMPORTANCE_HIGH);alerts.enableVibration(true);manager.createNotificationChannel(alerts);
        }
    }
    private PendingIntent open(String id){
        Intent intent=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if(id!=null)intent.putExtra("orderId",id);
        return PendingIntent.getActivity(this,id==null?0:id.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification status(String text){
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,OrderNotificationService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,SERVICE):new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_popup_sync).setContentTitle("دریافت سفارش‌های کافه").setContentText(text).setContentIntent(open(null)).setOngoing(true).setOnlyAlertOnce(true).addAction(android.R.drawable.ic_media_pause,"توقف",stop).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){prefs.edit().putBoolean("enabled",false).apply();stopSelf();return START_NOT_STICKY;}
        if(!prefs.getBoolean("enabled",false)){stopSelf();return START_NOT_STICKY;}
        if(Build.VERSION.SDK_INT>=34)startForeground(701,status("در حال اتصال…"),ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(701,status("در حال اتصال…"));
        cookie=CookieManager.getInstance().getCookie(ORIGIN);
        if(cookie==null||cookie.isEmpty()){authExpired();return START_NOT_STICKY;}
        if(!running){running=true;PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);wake=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,getPackageName()+":order-monitor");wake.acquire(10*60_000L);worker=new Thread(this::listen,"order-monitor");worker.start();}
        return START_STICKY;
    }
    private HttpURLConnection connection(String path)throws IOException{
        HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+path).openConnection();c.setConnectTimeout(15000);c.setReadTimeout(45000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Cookie",cookie);c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","CafeMohammadAdmin/2");return c;
    }
    private void authExpired(){
        prefs.edit().putBoolean("enabled",false).apply();manager.notify(702,newNotification("دریافت سفارش متوقف شد","برای ادامه، وارد پنل شوید و دریافت سفارش‌ها را فعال کنید.",null));stopSelf();
    }
    private Notification newNotification(String title,String text,String id){
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,ALERTS):new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(open(id)).setAutoCancel(true).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL).build();
    }
    private String readBody(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int count;while((count=in.read(chunk))!=-1)out.write(chunk,0,count);return out.toString("UTF-8");}
    private JSONArray orders(int page)throws Exception{
        HttpURLConnection c=connection(BASE+"?pageSize=100&page="+page);
        try{int status=c.getResponseCode();if(status==401||status==403||status==404){authExpired();throw new IOException("authentication_required");}if(status!=200)throw new IOException("http_"+status);
            try(InputStream in=c.getInputStream()){return new JSONObject(readBody(in)).getJSONArray("data");}
        }finally{c.disconnect();}
    }
    private void reconcile()throws Exception{
        long previous=prefs.getLong("last_number",-1),highest=previous;
        JSONObject seen=new JSONObject(prefs.getString("seen_orders","{}"));
        List<JSONObject> fresh=new ArrayList<>();boolean initial=previous<0,done=false;
        // Retain an overlap so late commits below the latest number are not mistaken for edits.
        long floor=initial?0:Math.max(0,previous-500);
        for(int page=1;!done;page++){
            JSONArray rows=orders(page);if(rows.length()==0)break;boolean inRange=false;
            for(int i=0;i<rows.length();i++){
                JSONObject order=rows.getJSONObject(i);long number=order.optLong("number");highest=Math.max(highest,number);
                if(initial&&page==1)floor=Math.max(0,highest-500);
                if(number<floor)continue;inRange=true;
                String id=order.getString("id");if(!seen.has(id))fresh.add(order);
            }
            if(rows.length()<100||!inRange)done=true;
        }
        fresh.sort((a,b)->Long.compare(a.optLong("number"),b.optLong("number")));
        for(JSONObject order:fresh){long number=order.optLong("number");String id=order.getString("id");String name=order.optJSONObject("customer")==null?"مشتری":order.getJSONObject("customer").optString("name","مشتری");if(name.trim().isEmpty())name="مشتری";
            if(!initial&&!"cancelled".equals(order.optString("status")))manager.notify(("order:"+id).hashCode(),newNotification("سفارش جدید","از طرف "+name,id));
            seen.put(id,number);
        }
        List<String> remove=new ArrayList<>();for(Iterator<String> keys=seen.keys();keys.hasNext();){String id=keys.next();if(seen.optLong(id)<highest-500)remove.add(id);}for(String id:remove)seen.remove(id);
        prefs.edit().putLong("last_number",Math.max(0,highest)).putString("seen_orders",seen.toString()).commit();
    }
    private void listen(){int backoff=3000;
        while(running){
            try{
                if(wake!=null){if(wake.isHeld())wake.release();wake.acquire(10*60_000L);}
                reconcile();if(!running)break;
                manager.notify(701,status("دریافت سفارش‌ها فعال است"));
                HttpURLConnection c=connection(BASE+"/live");active=c;c.setRequestProperty("Accept","text/event-stream");int status=c.getResponseCode();if(status==401||status==403||status==404){authExpired();break;}if(status!=200)throw new IOException("stream_"+status);
                backoff=3000;try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){String line;long refreshed=0;while(running&&(line=reader.readLine())!=null){if(line.startsWith("event: changed")){reconcile();}}}
            }catch(Exception e){if(!running)break;manager.notify(701,status("اتصال قطع است؛ تلاش برای اتصال دوباره…"));}
            finally{HttpURLConnection c=active;active=null;if(c!=null)c.disconnect();}
            if(running)try{Thread.sleep(backoff);backoff=Math.min(30000,backoff*2);}catch(InterruptedException e){break;}
        }
    }
    @Override public void onDestroy(){running=false;if(active!=null)active.disconnect();if(worker!=null)worker.interrupt();if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
