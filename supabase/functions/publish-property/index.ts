const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type PropertyPayload = {
  action?: 'publish' | 'delete' | 'update';
  title?: string;
  price?: number;
  area?: number;
  city?: string;
  district?: string;
  listing_type?: string;
  contact_phone?: string;
  property_type?: string;
  created_by_name?: string;
  images?: string[];
  property_url?: string;
  serial_number?: number;
  rooms?: number;
  bathrooms?: number;
  lounges?: number;
  kitchens?: number;
  floor_number?: number;
  floors?: number;
};

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
    const property = await req.json() as PropertyPayload;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!botToken || !chatId) return response({ error: 'Telegram is not configured' }, 503);

    const api = (method: string) => `https://api.telegram.org/bot${encodeURIComponent(botToken)}/${method}`;
    if (property.action === 'delete') {
      if (!property.title) return response({ error: 'Invalid property data' }, 400);
      const deletion = await fetch(api('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `إشعار إزالة إعلان\n\nتمت إزالة الإعلان رقم ${property.serial_number ?? '—'}: ${property.title}\nلم يعد العقار متاحاً على موقع درة الهجرة للعقارات.` }),
      });
      if (!deletion.ok) return response({ error: 'Telegram request failed' }, 502);
      return response({ posted: true });
    }

    if (!property.title || !property.city || !property.district || !property.price || !property.property_type || !property.property_url) {
      return response({ error: 'Invalid property data' }, 400);
    }
    const listingLabel = property.listing_type === 'rent' ? 'للإيجار' : 'للبيع';
    const actionLabel = property.action === 'update' ? 'تحديث إعلان' : 'عرض عقاري جديد';
    const lines: string[] = [
      `${actionLabel} | ${property.title}`,
      `رقم الإعلان: ${property.serial_number ?? '—'}`,
      `${listingLabel} · ${property.property_type}`,
      `السعر: ${new Intl.NumberFormat('ar-SA').format(property.price)} ر.س`,
    ];
    if (property.area && property.area > 0) {
      lines.push(`المساحة: ${new Intl.NumberFormat('ar-SA').format(property.area)} م²`);
    }
    lines.push(`الحي: ${property.district} · المدينة: ${property.city}`);

    if (property.property_type === 'شقة') {
      lines.push(
        `عدد الغرف: ${property.rooms ?? 0}`,
        `الحمامات: ${property.bathrooms ?? 0}`,
        `الصالات: ${property.lounges ?? 0}`,
        `المطابخ: ${property.kitchens ?? 0}`,
        `الدور: ${property.floor_number ?? 0}`,
        `عدد الأدوار: ${property.floors ?? 0}`,
      );
    }

    lines.push(
      `المعلن: ${property.created_by_name ?? 'درة الهجرة للعقارات'}`,
      'التواصل: 0569996744',
      `تفاصيل العقار: ${property.property_url}`,
    );
    const caption = lines.join('\n');

    const mainImage = property.images?.[0];
    let telegramResponse: Response;
    if (mainImage?.startsWith('http')) {
      telegramResponse = await fetch(api('sendPhoto'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: mainImage, caption }),
      });
    } else if (mainImage?.startsWith('data:image/')) {
      const separator = mainImage.indexOf(',');
      const encodedImage = separator >= 0 ? mainImage.slice(separator + 1) : '';
      const mimeType = mainImage.slice(5, mainImage.indexOf(';')) || 'image/jpeg';
      const bytes = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption);
      form.append('photo', new Blob([bytes], { type: mimeType }), 'property.jpg');
      telegramResponse = await fetch(api('sendPhoto'), { method: 'POST', body: form });
    } else {
      telegramResponse = await fetch(api('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: caption }),
      });
    }
    if (!telegramResponse.ok) return response({ error: 'Telegram request failed' }, 502);
    return response({ posted: true });
  } catch {
    return response({ error: 'Unable to publish property' }, 500);
  }
});
