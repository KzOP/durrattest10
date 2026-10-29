import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { db, storage } from '@/lib/firebase';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2, ChevronDown, ExternalLink, Eye, FilePenLine,
  LockKeyhole, MapPin, Menu, MessageCircle, Moon, Plus, Search,
  Send, SlidersHorizontal, Sun, Trash2, X, BedDouble, Bath, Layers3,
  MapPinned, Navigation, Share2, Phone, ClipboardList, LayoutGrid, RefreshCw
} from 'lucide-react';
import { createPortal } from 'react-dom';

type Staff = { id: string; display_name: string; phone: string; is_super_admin?: boolean };
type ManagedStaff = { id: string; display_name: string; phone: string; username: string | null; active: boolean; is_super_admin: boolean };
type Property = {
  id: string; created_by_staff_id: string | null; created_by_name: string; contact_phone: string;
  listing_type: 'sale' | 'rent'; property_type: string; title: string; city: string; district: string;
  street: string; price: number; area: number; rooms: number; lounges: number; floors: number; kitchens: number;
  bathrooms: number; floor_number: number; has_roof: boolean; has_elevator: boolean; notes: string;
  latitude: number | null; longitude: number | null; images: string[]; published: boolean; telegram_posted: boolean;
  created_at: string; serial_number?: number;
};
type FormState = Omit<Property, 'id' | 'created_by_staff_id' | 'created_by_name' | 'contact_phone' | 'created_at' | 'telegram_posted'> & { images: string[] };

const officePhone = '0539000650';
const whatsappNumber = '0569996744';
const logo = '/images/image.png';
const banner = '/images/5892abed-cf32-4fbc-b3d5-bf3cb95d8623.jpg';
const allPropertyTypes = ['شقة', 'فيلا', 'أرض', 'دور', 'عمارة', 'محل', 'مزرعة', 'حوش', 'ستوديو', 'بيت', 'أرض خام', 'أرض تجارية'];
type CategoryDef = { type: string; label: string };
const saleCategories: CategoryDef[] = [
  { type: 'الكل', label: 'الكل' },
  { type: 'عمارة', label: 'عمارة للبيع' },
  { type: 'فيلا', label: 'فيلا للبيع' },
  { type: 'أرض', label: 'أرض للبيع' },
  { type: 'شقة', label: 'شقة للبيع' },
  { type: 'محل', label: 'محل للبيع' },
  { type: 'مزرعة', label: 'مزرعة للبيع' },
  { type: 'بيت', label: 'بيت للبيع' },
  { type: 'أرض خام', label: 'أرض خام للبيع' },
  { type: 'دور', label: 'دور للبيع' },
  { type: 'ستوديو', label: 'ستوديو للبيع' },
  { type: 'حوش', label: 'حوش للبيع' },
];
const rentCategories: CategoryDef[] = [
  { type: 'الكل', label: 'الكل' },
  { type: 'عمارة', label: 'عمارة للإيجار' },
  { type: 'فيلا', label: 'فيلا للإيجار' },
  { type: 'أرض تجارية', label: 'أرض تجارية للإيجار' },
  { type: 'شقة', label: 'شقة للإيجار' },
  { type: 'دور', label: 'دور للإيجار' },
  { type: 'محل', label: 'محل للإيجار' },
  { type: 'مزرعة', label: 'مزرعة للإيجار' },
  { type: 'ستوديو', label: 'ستوديو للإيجار' },
];
const licenseNumber = '1200007348';
const initialForm: FormState = {
  listing_type: 'sale', property_type: 'شقة', title: '', city: '', district: '', street: '', price: 0,
  area: 0, rooms: 0, lounges: 0, floors: 0, kitchens: 0, bathrooms: 0, floor_number: 0, has_roof: false,
  has_elevator: false, notes: '', latitude: null, longitude: null, images: [], published: true,
};

function formatPrice(price: number, listingType: string) {
  return `${new Intl.NumberFormat('ar-SA').format(price)} ر.س ${listingType === 'rent' ? 'سنوياً' : ''}`;
}

function MapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onSelect(latlng.lat, latlng.lng) });
  return null;
}

function OfficeMap() {
  return (
    <MapContainer center={[24.64, 46.68]} zoom={13} scrollWheelZoom className="leaflet-map">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={[24.64, 46.68]} radius={10} pathOptions={{ color: '#bd9135', fillColor: '#efc968', fillOpacity: 0.85 }} />
    </MapContainer>
  );
}

function LocationPicker({ latitude, longitude, onSelect }: { latitude: number | null; longitude: number | null; onSelect: (latitude: number, longitude: number) => void }) {
  const position: [number, number] = latitude !== null && longitude !== null ? [latitude, longitude] : [24.7136, 46.6753];
  return (
    <div className="location-map">
      <MapContainer center={position} zoom={latitude !== null ? 15 : 11} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler onSelect={onSelect} />
        {latitude !== null && longitude !== null && <CircleMarker center={position} radius={10} pathOptions={{ color: '#bd9135', fillColor: '#efc968', fillOpacity: 0.85 }} />}
      </MapContainer>
    </div>
  );
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.setView([24.7136, 46.6753], 11);
    }
  }, [map, positions]);
  return null;
}

function FloatingMap({ properties, onSelect }: { properties: Property[]; onSelect: (property: Property) => void }) {
  const mapped = properties.filter((p) => p.latitude !== null && p.longitude !== null);
  const positions = mapped.map((p) => [p.latitude!, p.longitude!] as [number, number]);
  const center: [number, number] = positions.length > 0 ? positions[0] : [24.7136, 46.6753];
  const createPin = (serial: number | undefined) => L.divIcon({
    className: 'custom-pin',
    html: `<div class="pin-inner">${serial ?? '•'}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
  return (
    <div className="floating-map-wrapper">
      <div className="floating-map-header">
        <span className="eyebrow">خريطة العقارات</span>
        <h3>مواقع العقارات على الخريطة</h3>
        <small>{mapped.length} عقار موقع</small>
      </div>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="floating-map">
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {mapped.map((property) => (
          <Marker key={property.id} position={[property.latitude!, property.longitude!]} icon={createPin(property.serial_number)}>
            <Popup>
              <div className="map-popup">
                <span className="serial-badge">#{property.serial_number ?? '—'}</span>
                <strong>{property.title}</strong>
                <em className="card-price">{formatPrice(property.price, property.listing_type)}</em>
                <small><MapPin size={11} /> {property.city} — {property.district}</small>
                <button className="primary-button small" onClick={() => onSelect(property)}>عرض التفاصيل</button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
}

async function watermarkImage(file: File): Promise<string> {
  const source = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / source.width);
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(20, canvas.width / 26);
  context.save();
  context.font = `700 ${fontSize}px Arial`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.globalAlpha = 0.5;
  context.lineWidth = Math.max(3, fontSize / 9);
  context.strokeStyle = 'rgba(255,255,255,.85)';
  context.fillStyle = '#8a6d2f';
  const x = canvas.width - Math.max(24, canvas.width / 36);
  const y = canvas.height - Math.max(22, canvas.height / 28);
  context.strokeText('درة الهجرة للعقارات', x, y);
  context.fillText('درة الهجرة للعقارات', x, y);
  context.restore();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), milliseconds);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }).catch((error: unknown) => { window.clearTimeout(timer); reject(error); });
  });
}

async function uploadWatermarkedImages(propertyId: string, images: string[]): Promise<string[]> {
  return Promise.all(images.map(async (image, index) => {
    if (!image.startsWith('data:')) return image;
    try {
      const imageRef = storageRef(storage, `properties/${propertyId}/image-${index}.jpg`);
      return await withTimeout((async () => {
        await uploadString(imageRef, image, 'data_url', { contentType: 'image/jpeg' });
        return getDownloadURL(imageRef);
      })(), 5000);
    } catch {
      return image;
    }
  }));
}

function App() {
  const [dark, setDark] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', type: '', listing: '' });
  const [staff, setStaff] = useState<Staff | null>(() => {
    const stored = localStorage.getItem('durrat_staff');
    return stored ? JSON.parse(stored) as Staff : null;
  });
  const [modal, setModal] = useState<'login' | 'form' | 'details' | 'staff' | null>(null);
  const [selected, setSelected] = useState<Property | null>(null);
  const [loginMessage, setLoginMessage] = useState('');
  const [helpVisible, setHelpVisible] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sale' | 'rent'>('sale');
  const [selectedType, setSelectedType] = useState('الكل');
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [staffList, setStaffList] = useState<ManagedStaff[]>([]);
  const [staffDraft, setStaffDraft] = useState({ display_name: '', phone: '', password: '', username: '' });
  const isAdmin = Boolean(staff?.is_super_admin || staff?.phone === officePhone);

  useEffect(() => {
    const propertiesQuery = query(collection(db, 'properties'), orderBy('created_at', 'desc'));
    return onSnapshot(propertiesQuery, (snapshot) => {
      const loaded = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Property).filter((property) => property.published);
      const sorted = [...loaded].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      const existingMax = Math.max(0, ...loaded.map((p) => p.serial_number ?? 0));
      let nextSerial = existingMax;
      sorted.forEach((property) => {
        if (property.serial_number == null) {
          nextSerial += 1;
          property.serial_number = nextSerial;
          void updateDoc(doc(db, 'properties', property.id), { serial_number: nextSerial });
        }
      });
      setProperties(loaded);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  useEffect(() => {
    const propertyId = new URLSearchParams(window.location.search).get('property');
    const property = propertyId ? properties.find((item) => item.id === propertyId) : null;
    if (property && !selected) { setSelected(property); setModal('details'); }
  }, [properties, selected]);

  const cities = useMemo(() => [...new Set(properties.map((property) => property.city).filter(Boolean))], [properties]);
  const districts = useMemo(() => [...new Set(properties.map((property) => property.district).filter(Boolean))], [properties]);
  const visibleProperties = useMemo(() => properties.filter((property) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [property.title, property.city, property.district, property.street].some((value) => value.toLowerCase().includes(search));
    const matchesListing = property.listing_type === activeTab;
    const matchesType = selectedType === 'الكل' || property.property_type === selectedType;
    return matchesSearch && matchesListing && matchesType;
  }), [properties, filters, activeTab, selectedType]);

  const updateForm = (key: keyof FormState, value: string | number | boolean | null | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const scrollToListings = () => document.getElementById('listings')?.scrollIntoView({ behavior: 'smooth' });
  const openNewForm = () => { setForm(initialForm); setModal('form'); };
  const openEditForm = (property: Property) => {
    setForm({
      listing_type: property.listing_type, property_type: property.property_type, title: property.title,
      city: property.city, district: property.district, street: property.street, price: property.price,
      area: property.area ?? 0, rooms: property.rooms, lounges: property.lounges, floors: property.floors, kitchens: property.kitchens,
      bathrooms: property.bathrooms, floor_number: property.floor_number, has_roof: property.has_roof,
      has_elevator: property.has_elevator, notes: property.notes, latitude: property.latitude,
      longitude: property.longitude, images: property.images, published: property.published,
    }); setSelected(property); setModal('form');
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const phone = String(formData.get('phone') ?? '');
    const password = String(formData.get('password') ?? '');
    const { data, error } = await supabase.rpc('authenticate_staff', { p_login: phone, p_password: password });
    if (error || !data?.[0]) { setLoginMessage('بيانات الدخول غير صحيحة'); return; }
    const authenticatedStaff = data[0] as Staff;
    setStaff(authenticatedStaff); setAdminPassword(password); localStorage.setItem('durrat_staff', JSON.stringify(authenticatedStaff)); setLoginMessage(''); setModal(null);
  };

  const handleLogout = () => {
    setStaff(null);
    setAdminPassword('');
    setStaffList([]);
    setModal(null);
    localStorage.removeItem('durrat_staff');
    setNotice('تم تسجيل الخروج بنجاح.');
  };

  const loadStaff = async (password: string) => {
    if (!staff || !password) return;
    const { data, error } = await supabase.rpc('admin_list_staff', { p_admin_login: staff.phone, p_admin_password: password });
    if (error || !data) { setNotice('تعذر تحميل قائمة الموظفين.'); return; }
    setAdminPassword(password); setStaffList(data as ManagedStaff[]);
  };

  const updateAdminSelf = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!staff || !adminPassword) return;
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get('displayName') ?? '');
    const password = String(data.get('password') ?? '');
    const { data: result, error } = await supabase.rpc('admin_update_staff', { p_admin_login: staff.phone, p_admin_password: adminPassword, p_staff_id: staff.id, p_display_name: displayName, p_new_password: password });
    if (error || result !== true) { setNotice('تعذر تحديث بيانات الإدارة.'); return; }
    const updatedStaff = { ...staff, display_name: displayName };
    setStaff(updatedStaff); localStorage.setItem('durrat_staff', JSON.stringify(updatedStaff));
    if (password) setAdminPassword(password);
    setNotice('تم تحديث بيانات الإدارة.');
  };

  const updateStaff = async (member: ManagedStaff, displayName: string, password: string) => {
    if (!staff || !adminPassword) return;
    const { data, error } = await supabase.rpc('admin_update_staff', { p_admin_login: staff.phone, p_admin_password: adminPassword, p_staff_id: member.id, p_display_name: displayName, p_new_password: password });
    if (error || data !== true) { setNotice('تعذر تحديث الموظف.'); return; }
    await loadStaff(adminPassword); setNotice('تم تحديث بيانات الموظف.');
  };

  const createStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!staff || !adminPassword) return;
    const { data, error } = await supabase.rpc('admin_create_staff', { p_admin_login: staff.phone, p_admin_password: adminPassword, p_display_name: staffDraft.display_name, p_phone: staffDraft.phone, p_new_password: staffDraft.password, p_username: staffDraft.username });
    if (error || data !== true) { setNotice('تعذر إضافة الموظف. تأكد من البيانات وعدم تكرار الرقم.'); return; }
    setStaffDraft({ display_name: '', phone: '', password: '' }); await loadStaff(adminPassword); setNotice('تمت إضافة الموظف.');
  };

  const deleteStaff = async (member: ManagedStaff) => {
    if (!staff || !adminPassword || !window.confirm(`حذف حساب ${member.display_name}؟`)) return;
    const { data, error } = await supabase.rpc('admin_delete_staff', { p_admin_login: staff.phone, p_admin_password: adminPassword, p_staff_id: member.id });
    if (error || data !== true) { setNotice('تعذر حذف الموظف.'); return; }
    await loadStaff(adminPassword); setNotice('تم حذف الموظف.');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const images = await Promise.all(Array.from(files).slice(0, 6).map(watermarkImage));
      updateForm('images', [...form.images, ...images].slice(0, 6));
    } catch { setNotice('تعذر معالجة إحدى الصور. يرجى المحاولة مرة أخرى.'); }
  };

  const selectLocation = async (latitude: number, longitude: number) => {
    updateForm('latitude', latitude); updateForm('longitude', longitude);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ar`);
      const result = await response.json() as { address?: { city?: string; town?: string; village?: string; suburb?: string; neighbourhood?: string; road?: string } };
      const address = result.address ?? {};
      updateForm('city', address.city ?? address.town ?? address.village ?? '');
      updateForm('district', address.suburb ?? address.neighbourhood ?? ''); updateForm('street', address.road ?? '');
      setNotice('تم تحديد الدبوس واستخراج العنوان.');
    } catch { setNotice('تم تحديد الدبوس، تعذر استخراج اسم العنوان.'); }
  };

  const publishToTelegram = async (property: Property, action: 'publish' | 'delete' | 'update') => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ...property, action, property_url: `${window.location.origin}/?property=${property.id}` }),
    });
    if (!response.ok) throw new Error('telegram');
  };

  const saveProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!staff || saving) return;
    setSaving(true); setNotice('');
    try {
      const propertyRef = selected ? doc(db, 'properties', selected.id) : doc(collection(db, 'properties'));
      const imageUrls = await uploadWatermarkedImages(propertyRef.id, form.images);
      const isEditing = Boolean(selected);
      const serialNumber = selected?.serial_number ?? (properties.length > 0 ? Math.max(...properties.map((p) => p.serial_number ?? 0)) + 1 : 1);
      const payload = { ...form, images: imageUrls, serial_number: serialNumber, created_by_staff_id: staff.id, created_by_name: staff.display_name, contact_phone: staff.phone, telegram_posted: selected?.telegram_posted ?? false, created_at: selected?.created_at ?? new Date().toISOString() };
      const savedProperty = { ...payload, id: propertyRef.id } as Property;
      await setDoc(propertyRef, payload);
      const telegramAction: 'publish' | 'update' = isEditing ? 'update' : 'publish';
      setNotice(isEditing ? 'تم تحديث العقار بنجاح، جارٍ إرسال التحديث إلى تليجرام.' : 'تم حفظ العقار بنجاح، جارٍ إرساله إلى تليجرام.');
      setSaving(false); setModal(null); setSelected(null);
      void (async () => {
        try {
          await withTimeout(publishToTelegram(savedProperty, telegramAction), 8000);
          if (!isEditing) await updateDoc(propertyRef, { telegram_posted: true });
          setNotice(isEditing ? 'تم تحديث العقار وإرسال التحديث إلى تليجرام بنجاح.' : 'تم حفظ العقار ونشره في تليجرام بنجاح.');
        } catch {
          setNotice(isEditing ? 'تم تحديث العقار بنجاح وتعذر إرسال التحديث إلى تليجرام.' : 'تم حفظ العقار بنجاح وتعذر النشر في تليجرام.');
        }
      })();
    } catch {
      setNotice('تعذر حفظ العقار. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProperty = async (property: Property) => {
    if (!staff || (!isAdmin && property.created_by_staff_id !== staff.id) || !window.confirm('هل تريد حذف هذا العقار؟')) return;
    const [firestoreResult, telegramResult] = await Promise.allSettled([
      deleteDoc(doc(db, 'properties', property.id)),
      publishToTelegram(property, 'delete'),
    ]);
    if (firestoreResult.status === 'fulfilled' && telegramResult.status === 'fulfilled') setNotice('تم حذف العقار وإرسال إشعار الإزالة في تليجرام.');
    else if (firestoreResult.status === 'fulfilled') setNotice('تم حذف العقار من الموقع، لكن تعذر إرسال إشعار الإزالة في تليجرام.');
    else setNotice('تعذر حذف العقار بالكامل. لم يكتمل التزامن مع تليجرام.');
  };

  return (
    <div dir="rtl" className={dark ? 'app dark' : 'app light'}>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="الرئيسية"><img src={logo} alt="درة الهجرة للعقارات" /><span>درة الهجرة للعقارات</span></button>
          <nav className="desktop-nav"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>الرئيسية</button><button onClick={() => { setActiveTab('sale'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للبيع</button><button onClick={() => { setActiveTab('rent'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للإيجار</button><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer">موقع المكتب <ExternalLink size={14} /></a></nav>
          <div className="header-actions"><button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="تبديل الوضع">{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button className="mobile-menu icon-button" aria-label="القائمة" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)}><Menu size={20} /></button></div>
        </div>
      </header>

      {mobileNavOpen && createPortal(<div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}><nav className="mobile-nav" onClick={(event) => event.stopPropagation()}><button onClick={() => { setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>الرئيسية</button><button onClick={() => { setMobileNavOpen(false); setActiveTab('sale'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للبيع</button><button onClick={() => { setMobileNavOpen(false); setActiveTab('rent'); setSelectedType('الكل'); scrollToListings(); }}>عقارات للإيجار</button><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer" onClick={() => setMobileNavOpen(false)}>موقع المكتب <ExternalLink size={14} /></a>{staff ? <button onClick={() => { setMobileNavOpen(false); handleLogout(); }}><LockKeyhole size={14} /> تسجيل الخروج</button> : <button onClick={() => { setMobileNavOpen(false); setLoginMessage(''); setModal('login'); }}><LockKeyhole size={14} /> دخول الموظفين</button>}</nav></div>, document.body)}

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div className="dashboard-heading"><span className="eyebrow">منصة درة الهجرة</span><h1>عروضي العقارية</h1><p>كل عروضك العقارية في مكان واحد، بوضوح وسهولة.</p></div>
          <a className="office-location" href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={18} /><span>موقع<br /><b>المكتب</b></span></a>
          <div className="work-hours-note"><Phone size={15} /><span>يمكنكم الاتصال بنا في أوقات العمل الرسمية<br /><b>9ص-12م، العصر-12ص</b></span></div><div className="stats-grid"><div className="stat-card"><span className="stat-icon"><LayoutGrid size={17} /></span><strong>{properties.length}</strong><small>إجمالي العروض</small></div><div className="stat-card"><span className="stat-icon"><MapPin size={17} /></span><strong>{properties.filter((property) => property.latitude !== null).length}</strong><small>على الخريطة</small></div><div className="stat-card work-hours-card"><span className="stat-icon"><Phone size={17} /></span><strong>ساعات العمل</strong><small>9ص-12م · العصر-12ص</small></div></div>
          <div className="contact-cards"><a className="whatsapp-banner" href={`https://wa.me/966${whatsappNumber.replace(/^0/, '')}`} target="_blank" rel="noreferrer"><span className="contact-symbol"><MessageCircle size={31} /></span><span><small>التواصل عبر الواتساب</small><b>{whatsappNumber}</b></span><ChevronDown size={24} className="contact-arrow" /></a><div className="license-banner"><span className="license-symbol"><ClipboardList size={30} /></span><span><small>رقم الرخصة العقارية</small><b>{licenseNumber}</b></span></div></div>
          <div className="dashboard-footer"><span>تواصل معنا لإضافة العروض والطلبات</span><span>آخر تحديث: {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date())}</span></div>
        </section>

        <section className="view-tabs listing-type-tabs" id="listings"><button className={activeTab === 'sale' ? 'active' : ''} onClick={() => { setActiveTab('sale'); setSelectedType('الكل'); }}>عقارات للبيع <b>{properties.filter((property) => property.listing_type === 'sale').length}</b></button><button className={activeTab === 'rent' ? 'active' : ''} onClick={() => { setActiveTab('rent'); setSelectedType('الكل'); }}>عقارات للإيجار <b>{properties.filter((property) => property.listing_type === 'rent').length}</b></button></section>

        <section className="category-chips-bar"><div className="chips-track">{(activeTab === 'sale' ? saleCategories : rentCategories).map((cat) => { const count = cat.type === 'الكل' ? properties.filter((p) => p.listing_type === activeTab).length : properties.filter((p) => p.listing_type === activeTab && p.property_type === cat.type).length; const isActive = selectedType === cat.type; return <button key={cat.type} className={`chip ${isActive ? 'active' : ''} ${count === 0 && cat.type !== 'الكل' ? 'empty' : ''}`} onClick={() => setSelectedType(cat.type)}><span className="chip-label">{cat.label}</span>{count > 0 && <span className="chip-count">{count}</span>}{count === 0 && cat.type !== 'الكل' && <span className="chip-empty-dot" />}</button>; })}</div></section>

        <section className="filter-panel"><div className="filter-row"><label className="filter-search"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="ابحث باسم العقار أو المدينة أو الحي" /></label><select value={filters.search && cities.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">المدينة</option>{cities.map((city) => <option key={city}>{city}</option>)}</select><select value={filters.search && districts.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">الحي</option>{districts.map((district) => <option key={district}>{district}</option>)}</select></div></section>

        <FloatingMap properties={visibleProperties} onSelect={(property) => { setSelected(property); setModal('details'); }} />

        <section className="listings-section listing-results"><div className="section-top"><div><span className="eyebrow">مكتبة العروض</span><h2>العروض العقارية</h2></div><div className="section-actions">{isAdmin && <button className="outline-button" onClick={() => { setNotice(''); setModal('staff'); }}>إدارة الموظفين</button>}{staff && <button className="primary-button small" onClick={openNewForm}><Plus size={17} /> إضافة عقار</button>}</div></div><div className="results-meta"><span>{visibleProperties.length} عرض متاح</span><button className="refresh-button" onClick={() => window.location.reload()}><RefreshCw size={14} /> تحديث</button></div>
          {loading ? <div className="empty-state"><span className="loader" /> جاري تحميل العقارات</div> : visibleProperties.length === 0 ? <div className="empty-state"><Building2 size={38} /><p>لا توجد عقارات مطابقة للبحث</p><small>جرّب تغيير خيارات البحث أو التصنيف.</small></div> : <div className="property-grid">{visibleProperties.map((property) => <article className="property-card" key={property.id}><div className="card-topline"><span className="serial-badge">#{property.serial_number ?? '—'}</span><span className={`listing-badge ${property.listing_type}`}>{property.listing_type === 'sale' ? 'للبيع' : 'للإيجار'}</span></div><button className="card-image" onClick={() => { setSelected(property); setModal('details'); }}><img src={property.images[0] || logo} alt={property.title} /><span className="view-icon"><Eye size={17} /></span></button><div className="card-body"><h3>{property.title}</h3><div className="card-location"><MapPin size={14} /> {property.city} — {property.district}{property.street && ` — ${property.street}`}</div><p className="card-description">{property.notes || `عرض عقاري مميز في ${property.city || 'موقع مميز'}، تواصل معنا لمعرفة التفاصيل.`}</p><strong className="card-price">{formatPrice(property.price, property.listing_type)}</strong>{property.area > 0 && <span className="card-area"><Layers3 size={13} /> {new Intl.NumberFormat('ar-SA').format(property.area)} م²</span>}<div className="card-actions"><a className="location-action" href={property.latitude && property.longitude ? `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}` : 'https://goo.gl/maps/hP8rVmqhAiBm2XRcA'} target="_blank" rel="noreferrer"><Navigation size={15} /> الموقع</a><a className="whatsapp-action" href={`https://wa.me/966${whatsappNumber.replace(/^0/, '')}?text=${encodeURIComponent(`السلام عليكم ورحمة الله وبركاته، أنا مهتم بالإعلان رقم ${property.serial_number ?? ''}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a><button className="share-action" onClick={() => { void navigator.share?.({ title: property.title, text: property.title, url: `${window.location.origin}/?property=${property.id}` }); }}><Share2 size={15} /> مشاركة</button></div><div className="card-owner">بواسطة {property.created_by_name}</div>{(isAdmin || staff?.id === property.created_by_staff_id) && <div className="owner-actions"><button onClick={() => openEditForm(property)}><FilePenLine size={14} /> تعديل</button><button onClick={() => void deleteProperty(property)}><Trash2 size={14} /> حذف</button></div>}</div></article>)}</div>}
        </section>

        <section className="office-section"><div className="office-copy"><span className="eyebrow">موقع المكتب</span><h2>درة الهجرة للعقارات</h2><p>الجوال متاح يومياً من 9:00 صباحاً إلى 12:00 ظهراً، ومن صلاة العصر حتى 12:00 ليلاً.</p><p>موقع المكتب متاح خلال ساعات التواصل المذكورة أعلاه.</p><a className="outline-button" href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={17} /> فتح الموقع في قوقل ماب</a></div><div className="map-frame"><OfficeMap /></div></section>
      </main>

      <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><img src={logo} alt="" /><span>مكتب درة الهجرة للعقارات</span></div><div className="footer-contact"><a href={`tel:${officePhone}`}><MessageCircle size={17} /> {officePhone}</a><a href="https://goo.gl/maps/hP8rVmqhAiBm2XRcA" target="_blank" rel="noreferrer"><MapPin size={17} /> موقع المكتب</a></div><button className="staff-link" onClick={() => staff ? handleLogout() : (setLoginMessage(''), setModal('login'))}><LockKeyhole size={12} /> {staff ? 'تسجيل الخروج' : 'دخول الموظفين'}</button></div><div className="copyright">© {new Date().getFullYear()} درة الهجرة للعقارات</div></footer>
      {helpVisible && <div className="help-bubble"><button onClick={() => setHelpVisible(false)} aria-label="إغلاق"><X size={15} /></button><span>تحتاج مساعدة؟ تواصل معنا</span></div>}<a className="floating-whatsapp" href={`https://wa.me/966${whatsappNumber.replace(/^0/, '')}`} target="_blank" rel="noreferrer" aria-label="واتساب"><MessageCircle size={24} /></a>{notice && <div className="toast" role="status">{notice}</div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className={`modal ${modal === 'form' ? 'wide-modal' : ''}`}>
        <button className="modal-close" onClick={() => setModal(null)} aria-label="إغلاق"><X size={19} /></button>
        {modal === 'login' && <div className="login-modal"><div className="modal-icon"><LockKeyhole size={22} /></div><span className="eyebrow">بوابة المكتب</span><h2>دخول الموظفين</h2><p>استخدم اسم المستخدم أو رقم الجوال وكلمة المرور المعتمدة.</p><form onSubmit={handleLogin}><label>اسم المستخدم أو الجوال<input name="phone" inputMode="text" required placeholder="emp0@abcd0650 أو 05xxxxxxxx" /></label><label>كلمة المرور<input name="password" type="password" required /></label>{loginMessage && <div className="form-error">{loginMessage}</div>}<button className="primary-button submit-button">دخول <ChevronDown size={18} /></button></form></div>}
        {modal === 'staff' && isAdmin && <div className="staff-modal"><div className="form-heading"><div><span className="eyebrow">صلاحيات الإدارة العامة</span><h2>إدارة الموظفين</h2></div><span className="secure-note"><LockKeyhole size={14} /> {staff?.display_name}</span></div>{staffList.length === 0 ? <form className="admin-unlock" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void loadStaff(String(data.get('adminPassword') ?? '')); }}><p>أدخل كلمة مرور الإدارة لعرض وتعديل حسابات الموظفين.</p><input name="adminPassword" type="password" required placeholder="كلمة مرور الإدارة" /><button className="primary-button">فتح القائمة</button></form> : <><form className="admin-self-form" onSubmit={(event) => void updateAdminSelf(event)}><b>بيانات الإدارة العامة</b><input name="displayName" required defaultValue={staff?.display_name} placeholder="الاسم الظاهر" /><input name="password" type="password" minLength={8} placeholder="كلمة مرور جديدة (اختياري)" /><button className="outline-button">حفظ بيانات الإدارة</button></form><div className="staff-list">{staffList.map((member) => <div className="staff-row" key={member.id}><div><b>{member.display_name}</b><small>{member.phone}{member.username ? ` · ${member.username}` : ''}{member.is_super_admin ? ' · إدارة عامة' : ''}</small></div>{!member.is_super_admin && <><input defaultValue={member.display_name} aria-label={`اسم ${member.display_name}`} id={`name-${member.id}`} /><input type="password" placeholder="كلمة مرور جديدة" aria-label={`كلمة مرور ${member.display_name}`} id={`password-${member.id}`} /><button className="outline-button" type="button" onClick={() => { const name = document.getElementById(`name-${member.id}`) as HTMLInputElement; const password = document.getElementById(`password-${member.id}`) as HTMLInputElement; void updateStaff(member, name.value, password.value); }}>حفظ</button><button className="danger-button" type="button" onClick={() => void deleteStaff(member)}><Trash2 size={14} /></button></>}</div>)}</div><form className="add-staff-form" onSubmit={(event) => void createStaff(event)}><b>إضافة حساب موظف</b><input required value={staffDraft.display_name} onChange={(event) => setStaffDraft({ ...staffDraft, display_name: event.target.value })} placeholder="الاسم الظاهر" /><input required value={staffDraft.username} onChange={(event) => setStaffDraft({ ...staffDraft, username: event.target.value })} placeholder="اسم المستخدم للدخول" /><input required value={staffDraft.phone} onChange={(event) => setStaffDraft({ ...staffDraft, phone: event.target.value })} placeholder="05xxxxxxxx" /><input required minLength={8} type="password" value={staffDraft.password} onChange={(event) => setStaffDraft({ ...staffDraft, password: event.target.value })} placeholder="كلمة المرور" /><button className="primary-button">إضافة</button></form></>}</div>}
        {modal === 'details' && selected && <div className="details-modal"><div className="details-image"><img src={selected.images[0] || logo} alt={selected.title} /></div><span className={`listing-badge ${selected.listing_type}`}>{selected.listing_type === 'sale' ? 'للبيع' : 'للإيجار'}</span><span className="serial-badge">#{selected.serial_number ?? '—'}</span><div className="card-location"><MapPin size={14} /> {selected.city} — {selected.district} {selected.street && `— ${selected.street}`}</div><p className="advertiser-line">المعلن: <strong>{selected.created_by_name}</strong></p><h2>{selected.title}</h2><strong className="detail-price">{formatPrice(selected.price, selected.listing_type)}</strong>{selected.area > 0 && <div className="detail-area"><Layers3 size={15} /> المساحة: {new Intl.NumberFormat('ar-SA').format(selected.area)} م²</div>}{selected.property_type === 'شقة' && <div className="detail-grid"><span>عدد الغرف <b>{selected.rooms}</b></span><span>الحمامات <b>{selected.bathrooms}</b></span><span>الصالات <b>{selected.lounges}</b></span><span>المطابخ <b>{selected.kitchens}</b></span><span>الدور <b>{selected.floor_number}</b></span><span>عدد الأدوار <b>{selected.floors}</b></span><span>مصعد <b>{selected.has_elevator ? 'نعم' : 'لا'}</b></span><span>سطح <b>{selected.has_roof ? 'نعم' : 'لا'}</b></span></div>}{selected.notes && <p className="notes">{selected.notes}</p>}<a className="primary-button submit-button" href={`https://wa.me/966${whatsappNumber.replace(/^0/, '')}?text=${encodeURIComponent(`السلام عليكم ورحمة الله وبركاته، أنا مهتم بالإعلان رقم ${selected.serial_number ?? ''}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> تواصل عبر واتساب</a></div>}
        {modal === 'form' && <form className="property-form" onSubmit={(event) => void saveProperty(event)}><div className="form-heading"><div><span className="eyebrow">إدارة العروض</span><h2>{selected ? 'تعديل العقار' : 'إضافة عقار جديد'}</h2></div><span className="secure-note"><LockKeyhole size={14} /> {staff?.display_name}</span></div><div className="form-grid"><label className="full">عنوان العقار<input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="مثال: فيلا عائلية بحي النخيل" /></label><label>نوع العرض<select value={form.listing_type} onChange={(event) => updateForm('listing_type', event.target.value)}><option value="sale">بيع</option><option value="rent">إيجار</option></select></label><label>نوع العقار<select value={form.property_type} onChange={(event) => updateForm('property_type', event.target.value)}>{allPropertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>المدينة<input required value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label><label>الحي<input required value={form.district} onChange={(event) => updateForm('district', event.target.value)} /></label><label>الشارع<input value={form.street} onChange={(event) => updateForm('street', event.target.value)} /></label><label>السعر<input required type="number" min="0" value={form.price} onChange={(event) => updateForm('price', Number(event.target.value))} /></label><label>المساحة (م²)<input type="number" min="0" value={form.area} onChange={(event) => updateForm('area', Number(event.target.value))} /></label>{form.property_type === 'شقة' && [['rooms','عدد الغرف'],['bathrooms','الحمامات'],['lounges','الصالات'],['kitchens','المطابخ'],['floor_number','الدور'],['floors','عدد الأدوار']].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" value={form[key as keyof FormState] as number} onChange={(event) => updateForm(key as keyof FormState, Number(event.target.value))} /></label>)}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_roof} onChange={(event) => updateForm('has_roof', event.target.checked)} /> يوجد سطح</label>}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_elevator} onChange={(event) => updateForm('has_elevator', event.target.checked)} /> يوجد مصعد</label>}<label className="full">ملاحظات إضافية<textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} /></label><label className="full file-label"><span>صور العقار <small>علامة رمادية واضحة في الزاوية اليمنى السفلى</small></span><input type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} /></label></div><div className="image-previews">{form.images.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`}><img src={image} alt={`صورة ${index + 1}`} /><button type="button" onClick={() => updateForm('images', form.images.filter((_, imageIndex) => imageIndex !== index))}><X size={14} /></button></div>)}</div><div className="location-heading"><span>موقع العقار</span><small>اضغط على الخريطة لوضع الدبوس، وسيتم استخراج المدينة والحي والشارع تلقائياً.</small></div><LocationPicker latitude={form.latitude} longitude={form.longitude} onSelect={(latitude, longitude) => void selectLocation(latitude, longitude)} />{form.latitude !== null && <div className="location-row"><MapPinned size={16} /><span>{form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}</span></div>}{notice && <div className="form-note">{notice}</div>}<div className="form-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : <><Send size={17} /> حفظ ونشر في تليجرام</>}</button></div></form>}
      </div></div>}
    </div>
  );
}

export default App;
