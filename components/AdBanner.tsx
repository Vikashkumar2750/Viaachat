import React, { useEffect } from 'react';

// ─── AdSense Banner Component ─────────────────────────────────────────────────
// Uses Google AdSense for monetization (correct choice for PWA/web apps).
// AdMob is only for native Android/iOS apps (React Native, Flutter).
//
// HOW TO ACTIVATE:
// 1. Sign up at https://adsense.google.com
// 2. Add your site viaachat.vercel.app
// 3. Replace ADSENSE_CLIENT_ID and ADSENSE_SLOT_ID below with your real values
// 4. Add this script to index.html <head>:
//    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
//
// PLACEMENT STRATEGY (non-intrusive):
//   - ChatListAd: between chats list header and chat items
//   - RoomsAd: between room cards
//   - CallsAd: below the random call button
//   - ProfileAd: bottom of settings screen

const ADSENSE_CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX'; // replace with your ID
const ADSENSE_SLOTS = {
  banner: 'XXXXXXXXXX',       // 320×50 horizontal banner
  rectangle: 'XXXXXXXXXX',   // 300×250 in-content rectangle
  native: 'XXXXXXXXXX',      // native in-feed ad
};

type AdFormat = 'banner' | 'rectangle' | 'native';
type AdVariant = 'chatlist' | 'rooms' | 'calls' | 'profile' | 'default';

interface AdBannerProps {
  format?: AdFormat;
  variant?: AdVariant;
  className?: string;
}

// DEV mode: show placeholder when no real ad client configured
const IS_CONFIGURED = !ADSENSE_CLIENT.includes('XXXX');

const PlaceholderAd: React.FC<{ format: AdFormat; variant: AdVariant }> = ({ format, variant }) => {
  const heights: Record<AdFormat, string> = {
    banner: 'h-12',
    rectangle: 'h-[250px]',
    native: 'h-16',
  };

  // In development / unconfigured state — show a subtle placeholder
  // so devs can see where ads will appear without cluttering the UI
  if (process.env.NODE_ENV === 'production') return null; // hide in prod if not configured

  return (
    <div className={`w-full ${heights[format]} flex items-center justify-center bg-gray-100/50 border border-dashed border-gray-200 rounded-xl`}>
      <span className="text-[10px] text-gray-300 font-medium uppercase tracking-widest">Ad · {variant}</span>
    </div>
  );
};

export const AdBanner: React.FC<AdBannerProps> = ({
  format = 'banner',
  variant = 'default',
  className = '',
}) => {
  useEffect(() => {
    if (!IS_CONFIGURED) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {}
  }, []);

  if (!IS_CONFIGURED) {
    return <PlaceholderAd format={format} variant={variant} />;
  }

  const slotId = format === 'banner' ? ADSENSE_SLOTS.banner
    : format === 'rectangle' ? ADSENSE_SLOTS.rectangle
    : ADSENSE_SLOTS.native;

  const styles: Record<AdFormat, React.CSSProperties> = {
    banner: { display: 'inline-block', width: '100%', height: '50px' },
    rectangle: { display: 'inline-block', width: '300px', height: '250px' },
    native: { display: 'block' },
  };

  return (
    <div className={`overflow-hidden ${className}`}>
      <ins
        className="adsbygoogle"
        style={styles[format]}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format={format === 'native' ? 'fluid' : 'auto'}
        data-full-width-responsive="true"
      />
    </div>
  );
};
