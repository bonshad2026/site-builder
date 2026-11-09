package ir.cafemohammad.app;

import android.app.Activity;
import android.animation.ValueAnimator;
import android.content.Intent;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;

public class MainActivity extends Activity {
    private static final String HOST = "cafemohammad.tibasoft.ir";
    private static final String SITE = "https://" + HOST + "/fa";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private FrameLayout root;
    private Splash splash;
    private LinearLayout error;
    private long started;
    private boolean failed;
    private final Runnable timeout = () -> showError();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        // Own system insets once; do not let both decor and WebView reserve them.
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255,249,239));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                root.setPadding(i.left, i.top, i.right, Math.max(i.bottom, keyboard));
            } else {
                root.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            // WebView must not apply the already-reserved bottom safe area again.
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " SiteBuilderAndroid/2");
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setBackgroundColor(Color.rgb(255,249,239));
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri url = req.getUrl();
                if ("sitebuilder-share".equals(url.getScheme())) {
                    Uri current = Uri.parse(view.getUrl() == null ? "" : view.getUrl());
                    String text = url.getQueryParameter("text");
                    if (req.isForMainFrame() && "https".equals(current.getScheme()) && HOST.equals(current.getHost()) && "order".equals(url.getHost()) && text != null && text.length() <= 16000) {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType("text/plain");
                        send.putExtra(Intent.EXTRA_SUBJECT, "ثبت سفارش کافه محمد");
                        send.putExtra(Intent.EXTRA_TEXT, text);
                        try { startActivity(Intent.createChooser(send, "ثبت سفارش")); }
                        catch (android.content.ActivityNotFoundException ignored) { Toast.makeText(MainActivity.this, "برنامه‌ای برای ارسال پیدا نشد؛ متن سفارش را کپی کنید", Toast.LENGTH_LONG).show(); }
                    }
                    return true;
                }
                if ("https".equals(url.getScheme()) && HOST.equals(url.getHost())) return false;
                if (!req.isForMainFrame()) return true;
                String scheme = url.getScheme();
                if ("https".equals(scheme) || "http".equals(scheme) || "tel".equals(scheme) || "mailto".equals(scheme)) {
                    try { startActivity(new Intent("tel".equals(scheme) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, url)); }
                    catch (android.content.ActivityNotFoundException ignored) { Toast.makeText(MainActivity.this,"برنامهٔ مناسب برای بازکردن لینک پیدا نشد",Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                if (!failed && Uri.parse(url).getHost().equals(HOST)) {
                    handler.removeCallbacks(timeout);
                    handler.postDelayed(() -> hideSplash(), Math.max(0, 1600 - (SystemClock.uptimeMillis()-started)));
                }
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) { if(r.isForMainFrame()) showError(); }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse e) { if(r.isForMainFrame() && e.getStatusCode()>=400) showError(); }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler h, android.net.http.SslError e) { h.cancel(); showError(); }
        });
        load();
    }
    private void load() {
        failed = false; started = SystemClock.uptimeMillis();
        if(error!=null) { root.removeView(error); error=null; }
        if(splash!=null) { splash.stop(); root.removeView(splash); }
        splash=new Splash();root.addView(splash,new FrameLayout.LayoutParams(-1,-1));
        handler.removeCallbacks(timeout);handler.postDelayed(timeout,20000);
        web.loadUrl(SITE);
    }
    private void hideSplash() {
        if(failed || splash==null) return;
        final Splash old=splash;splash=null;
        old.animate().alpha(0f).setDuration(420).withEndAction(()->{old.stop();root.removeView(old);}).start();
    }
    private void showError() {
        if(isFinishing() || failed) return;
        failed=true;handler.removeCallbacks(timeout);
        if(splash!=null){splash.stop();root.removeView(splash);splash=null;}
        error=new LinearLayout(this);error.setOrientation(LinearLayout.VERTICAL);error.setGravity(Gravity.CENTER);error.setPadding(36,36,36,36);error.setBackgroundColor(Color.rgb(255,249,239));
        ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.cafe_logo);error.addView(logo,new LinearLayout.LayoutParams(dp(100),dp(100)));
        TextView title=new TextView(this);title.setText("ارتباط با کافه برقرار نشد");title.setTextSize(23);title.setGravity(Gravity.CENTER);title.setTextColor(Color.rgb(43,33,24));error.addView(title);
        TextView note=new TextView(this);note.setText("اینترنت را بررسی کنید و دوباره تلاش کنید.\nممکن است سرور کافه موقتاً در دسترس نباشد.");note.setTextSize(16);note.setGravity(Gravity.CENTER);note.setPadding(0,24,0,32);error.addView(note);
        Button retry=new Button(this);retry.setText("تلاش مجدد");retry.setOnClickListener(v->load());error.addView(retry);root.addView(error,new FrameLayout.LayoutParams(-1,-1));
    }
    private int dp(float n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private long lastBackAt;
    /** Back walks the site's history like a browser; at its first page a second press within 2 s exits. */
    private void handleBack(){
        if(web!=null&&web.canGoBack()){web.goBack();return;}
        long now=SystemClock.elapsedRealtime();
        if(now-lastBackAt<2000){finish();return;}
        lastBackAt=now;
        Toast.makeText(this,"برای خروج، دوباره دکمهٔ بازگشت را بزنید",Toast.LENGTH_SHORT).show();
    }
    @Override public void onBackPressed(){handleBack();}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(splash!=null)splash.stop();if(web!=null)web.destroy();super.onDestroy();}
    private class Splash extends View {
        private final Paint p=new Paint(3);
        private final Bitmap logo=BitmapFactory.decodeResource(getResources(),R.drawable.cafe_logo);
        private final ValueAnimator motion=ValueAnimator.ofFloat(0,1);
        private float phase;
        Splash(){super(MainActivity.this);setContentDescription("کافه محمد؛ صبحانه، قهوه و یک حال خوب");motion.setDuration(2200);motion.setRepeatCount(ValueAnimator.INFINITE);motion.addUpdateListener(a->{phase=(float)a.getAnimatedValue();invalidate();});motion.start();}
        void stop(){motion.cancel();}
        @Override protected void onDraw(Canvas c){
            float w=getWidth(),h=getHeight(),cx=w/2,cy=h*.43f,r=dp(80);
            p.setShader(new RadialGradient(cx,cy,w*.85f,new int[]{Color.rgb(113,61,16),Color.rgb(36,24,15)},null,Shader.TileMode.CLAMP));c.drawRect(0,0,w,h,p);p.setShader(null);
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(dp(1));p.setColor(Color.argb(80,255,177,63));c.drawCircle(cx,cy,r+dp(14)+(float)Math.sin(phase*Math.PI*2)*dp(4),p);p.setStyle(Paint.Style.FILL);
            p.setAlpha(255);c.save();float scale=.97f+.03f*(float)Math.sin(phase*Math.PI);c.scale(scale,scale,cx,cy);
            Path clip=new Path();clip.addCircle(cx,cy,r,Path.Direction.CW);c.clipPath(clip);c.drawBitmap(logo,null,new RectF(cx-r,cy-r,cx+r,cy+r),p);c.restore();
            for(int j=0;j<3;j++){float t=(phase+j/3f)%1f;float x=cx+(j-1)*dp(20),y=cy-r-dp(16)-t*dp(50);p.setColor(Color.argb((int)(150*(1-t)),255,224,178));p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(dp(2));Path steam=new Path();steam.moveTo(x,y);steam.cubicTo(x-dp(12),y-dp(9),x+dp(12),y-dp(20),x,y-dp(30));c.drawPath(steam,p);}p.setStyle(Paint.Style.FILL);
            p.setTextAlign(Paint.Align.CENTER);p.setColor(Color.rgb(255,247,230));p.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));p.setTextSize(dp(34));c.drawText("کافه محمد",cx,cy+r+dp(68),p);
            p.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));p.setTextSize(dp(15));p.setColor(Color.rgb(238,202,151));c.drawText("صبحانه، قهوه و یک حالِ خوب",cx,cy+r+dp(103),p);
            p.setTextSize(dp(10));c.drawText("CAFE MOHAMMAD  ·  MARVDASHT",cx,h-dp(75),p);
            for(int j=0;j<3;j++){float t=(phase*3+j)%3;p.setColor(Color.argb((int)(80+175*(1-Math.abs(t-1.5f)/1.5f)),245,158,36));c.drawCircle(cx+(j-1)*dp(13),h-dp(120),dp(3),p);}
        }
    }
}
