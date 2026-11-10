import React, { useEffect, useState } from 'react';
import { Scissors, CheckCircle, Upload, Search, AlertCircle } from 'lucide-react';
import { CustomClothingRequest, CustomRequestStatus } from '../types';
import { createCustomRequest } from '../services/api';
import { post, privateToken, readStored, store, uploadImage } from '../services/checkout';
import { isBackendConfigured, backendUnavailableMessage } from '../services/http';

interface CustomClothingViewProps {
  onNavigateHome: () => void;
}

export const CustomClothingView: React.FC<CustomClothingViewProps> = () => {
  const [activeTab, setActiveTab] = useState<'request' | 'track'>('request');

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'Men' | 'Women' | 'Unisex'>('Unisex');
  const [clothingType, setClothingType] = useState('');
  const [preferredColor, setPreferredColor] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [occasion, setOccasion] = useState('');
  const [description, setDescription] = useState('');
  const [preferredDeadline, setPreferredDeadline] = useState('');
  const [referenceImage, setReferenceImage] = useState<string>('');
  const [uploadedImage,setUploadedImage]=useState<{media_id:string;upload_token:string}|null>(null);
  const [submission,setSubmission]=useState<{key:string;token:string;payload?:Record<string,unknown>}>(()=>readStored('aurie_custom_submission',{key:crypto.randomUUID(),token:privateToken()}));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [imageError, setImageError] = useState('');
  const [readingImage, setReadingImage] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<CustomClothingRequest | null>(null);

  // Tracking State
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingToken,setTrackingToken]=useState('');
  const [trackedRequest, setTrackedRequest] = useState<CustomClothingRequest | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [searchingTrack, setSearchingTrack] = useState(false);

  useEffect(()=>{
    if(!trackedRequest || activeTab!=='track')return;
    let active=true;
    const timer=setInterval(()=>{void post<CustomClothingRequest>('/api/custom-requests/track',{request_number:trackedRequest.request_number,...(trackingToken?{access_token:trackingToken}:{})}).then(value=>{if(active)setTrackedRequest(value);}).catch(e=>{if(active)setTrackingError(e.message);});},10000);
    return()=>{active=false;clearInterval(timer);};
  },[trackedRequest?.request_number,trackingToken,activeTab]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImageError('');
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setImageError('Choose a JPG, PNG or WebP image up to 5 MB.');
        e.target.value = '';
        return;
      }
      setReadingImage(true);
      const preview=URL.createObjectURL(file);setReferenceImage(preview);
      try {const uploaded=await uploadImage(file,'custom');setUploadedImage({media_id:uploaded.media_id,upload_token:uploaded.upload_token});}
      catch(error){setUploadedImage(null);setImageError((error as Error).message);}
      finally{setReadingImage(false);}
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBackendConfigured) { setSubmitError(backendUnavailableMessage); return; }
    setSubmitError('');
    setSubmitting(true);

    try {
      if(referenceImage && !uploadedImage)throw new Error('Upload the reference image successfully or remove it before submitting.');
      const payload: Record<string,unknown> = submission.payload || {
        full_name: fullName,
        phone,
        email,
        gender,
        clothing_type: clothingType,
        preferred_color: preferredColor,
        measurements,
        occasion,
        description,
        ...(uploadedImage || {}),
        access_token:submission.token,
        preferred_deadline: preferredDeadline,
      };

      const pending={...submission,payload};store('aurie_custom_submission',pending);setSubmission(pending);
      const newReq = await createCustomRequest(payload,submission.key);
      store('aurie_custom_tracking',{number:newReq.request_number,token:submission.token});
      setTrackingToken(submission.token);
      setSubmittedRequest(newReq);
    } catch(error) {
      setSubmitError((error as Error).message+' Your details are retained; retry recovers the same submission.');
      if((error as any).status>=400 && (error as any).status<500 && (error as any).code!=='IDEMPOTENCY_CONFLICT'){const next={key:crypto.randomUUID(),token:submission.token};store('aurie_custom_submission',next);setSubmission(next);}
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBackendConfigured) { setTrackingError(backendUnavailableMessage); return; }
    setTrackingError('');
    setTrackedRequest(null);
    if (!trackingNumber.trim()) return;

    setSearchingTrack(true);
    try {
      const cleanInput = trackingNumber.trim().toUpperCase().replace('#', '');
      const stored=readStored<{number:string;token:string}|null>('aurie_custom_tracking',null);
      const proof=trackingToken || (stored?.number===cleanInput?stored.token:'');
      const found=await post<CustomClothingRequest>('/api/custom-requests/track',{request_number:cleanInput,...(proof?{access_token:proof}:{})});
      setTrackingToken(proof);

      if (found) {
        setTrackedRequest(found);
      } else {
        setTrackingError(`No custom request found for "${trackingNumber}". Please check the number.`);
      }
    } catch(error) {
      setTrackingError((error as Error).message);
    } finally {
      setSearchingTrack(false);
    }
  };

  const statusPipeline: CustomRequestStatus[] = [
    'NEW',
    'CONTACTED',
    'DESIGNING',
    'APPROVED',
    'IN PRODUCTION',
    'READY',
    'COMPLETED'
  ];

  const getStatusIndex = (st: CustomRequestStatus) => statusPipeline.indexOf(st);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--tone-2b2b2b)] bg-[var(--tone-141414)] text-[10px] uppercase tracking-[0.25em] text-[var(--tone-d4d4d4)]">
          <Scissors size={12} className="text-[var(--tone-f5f5f5)]" />
          <span>AURIE · MADE TO ORDER</span>
        </div>
        <h1 className="font-heading text-5xl sm:text-7xl font-semibold text-[var(--tone-ffffff)] uppercase tracking-tight">
          Customs
        </h1>
        <p className="text-lg text-[var(--tone-f5f5f5)]">Your idea. Your fit. Made for you.</p>
        <p className="text-sm text-[var(--tone-a3a3a3)] leading-relaxed">
          We make custom clothes for you — everyday shirts, dresses, suits, matching sets and cultural pieces. Tell us what you have in mind, share your inspiration, and we’ll help bring it to life.
        </p>
      </div>

      <ol aria-label="How Customs works" className="grid sm:grid-cols-3 gap-6 border-y border-[var(--tone-262626)] py-6 text-sm">
        {[
          ['Share your idea', 'Tell us about the garment, fit and details. Add a sketch or reference photo if you have one.'],
          ['Plan your piece', 'We’ll contact you to discuss the design, measurements, price and timing.'],
          ['Made around you', 'Once the details are agreed, follow your piece from design through production.'],
        ].map(([title, detail], index) => (
          <li key={title} className="space-y-2">
            <span className="text-[10px] tracking-widest text-[var(--tone-737373)]">0{index + 1}</span>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs leading-relaxed text-[var(--tone-a3a3a3)]">{detail}</p>
          </li>
        ))}
      </ol>

      {/* Tabs */}
      {!isBackendConfigured && <p role="status" className="max-w-3xl mx-auto border border-[var(--tone-333333)] p-4 text-sm leading-relaxed">
        Custom requests and tracking are temporarily unavailable. You can explore the options below; submissions will open soon.
      </p>}
      <div className="flex justify-center border-b border-[var(--tone-222222)]">
        <div className="flex gap-4">
          <button
            aria-pressed={activeTab === 'request'}
            onClick={() => setActiveTab('request')}
            className={`pb-3 text-xs uppercase tracking-widest font-semibold transition-colors relative ${
              activeTab === 'request' ? 'text-[var(--tone-ffffff)]' : 'text-[var(--tone-737373)] hover:text-[var(--tone-d4d4d4)]'
            }`}
          >
            Start a custom request
            {activeTab === 'request' && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--tone-ffffff)]"></span>
            )}
          </button>

          <button
            aria-pressed={activeTab === 'track'}
            onClick={() => setActiveTab('track')}
            className={`pb-3 text-xs uppercase tracking-widest font-semibold transition-colors relative ${
              activeTab === 'track' ? 'text-[var(--tone-ffffff)]' : 'text-[var(--tone-737373)] hover:text-[var(--tone-d4d4d4)]'
            }`}
          >
            Track your request
            {activeTab === 'track' && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[var(--tone-ffffff)]"></span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Submit Custom Request Form */}
      {activeTab === 'request' && (
        <div className="max-w-3xl mx-auto bg-[var(--tone-141414)] border border-[var(--tone-262626)] p-6 sm:p-10 shadow-xl">
          {submittedRequest ? (
            <div className="text-center py-10 space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle size={32} />
              </div>

              <div>
                <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">
                  Custom Request Received
                </span>
                <h2 className="font-heading text-2xl font-bold text-[var(--tone-ffffff)] mt-1">
                  Thank you, {submittedRequest.full_name}
                </h2>
                <p className="text-xs text-[var(--tone-a3a3a3)] mt-2 max-w-md mx-auto">
                  We’ll review your idea and contact you on {submittedRequest.phone} to discuss the design, price and timing. Keep your request number to track progress.
                </p>
              </div>

              <div className="bg-[var(--tone-0d0d0d)] border border-[var(--tone-222222)] p-4 max-w-sm mx-auto text-xs text-left space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-[var(--tone-737373)]">Request #:</span>
                  <span className="text-[var(--tone-ffffff)] font-bold">{submittedRequest.request_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--tone-737373)]">Garment:</span>
                  <span className="text-[var(--tone-d4d4d4)]">{submittedRequest.clothing_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--tone-737373)]">Status:</span>
                  <span className="text-[var(--tone-f5f5f5)] font-bold">{submittedRequest.status}</span>
                </div>
                <p className="pt-3">Keep this private tracking token. If you submitted while signed in, use that same account.</p>
                <code className="block break-all select-all">{submission.token}</code>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-4">
                <button
                  onClick={() => {
                    setTrackingNumber(submittedRequest.request_number);
                    setTrackedRequest(submittedRequest);
                    setActiveTab('track');
                  }}
                  className="bg-[var(--tone-ffffff)] text-[var(--tone-000000)] font-semibold text-xs uppercase tracking-widest px-6 py-2.5 hover:bg-[var(--tone-e5e5e5)] transition-colors"
                >
                  Track Request Status
                </button>
                <button
                  onClick={() => {
                    setSubmittedRequest(null);
                    setClothingType(''); setPreferredColor(''); setMeasurements('');
                    setOccasion(''); setDescription(''); setPreferredDeadline('');
                    setReferenceImage('');setUploadedImage(null);setImageError('');setSubmitError('');
                    const next={key:crypto.randomUUID(),token:privateToken()};setSubmission(next);store('aurie_custom_submission',next);
                  }}
                  className="border border-[var(--tone-333333)] text-[var(--tone-d4d4d4)] text-xs uppercase tracking-widest px-6 py-2.5 hover:border-[var(--tone-737373)] transition-colors"
                >
                  Submit Another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 text-[var(--tone-f5f5f5)]">
              {submission.payload && <p className="text-sm">A previous submission can be recovered. <button type="button" className="underline" disabled={submitting} onClick={handleSubmit}>Recover previous request</button></p>}
              <div>
                <h2 className="text-xl font-semibold">Tell us about your piece</h2>
                <p className="text-xs leading-relaxed text-[var(--tone-a3a3a3)] mt-2">Share as much as you know. We’ll confirm the price and completion date with you before making your garment. Fields marked * are required.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="custom-name" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    id="custom-name"
                    autoComplete="name"
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marie Claire Uwera"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div>
                  <label htmlFor="custom-phone" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Phone / WhatsApp (+250) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    id="custom-phone"
                    autoComplete="tel"
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+250 788 000 000"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div>
                  <label htmlFor="custom-email" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    id="custom-email"
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. client@email.rw"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div>
                  <label htmlFor="custom-fit" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Fit / Collection
                  </label>
                  <select
                    value={gender}
                    id="custom-fit"
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  >
                    <option value="Unisex">Unisex / Gender-Neutral</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="custom-garment" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Clothing Type *
                  </label>
                  <input
                    type="text"
                    required
                    value={clothingType}
                    id="custom-garment"
                    list="custom-garment-types"
                    onChange={(e) => setClothingType(e.target.value)}
                    placeholder="e.g. Shirt, dress, suit or your own idea"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                  <datalist id="custom-garment-types">
                    {['Shirt / Top', 'Dress', 'Suit', 'Trousers / Skirt', 'Matching Set', 'Jacket / Hoodie', 'Cultural / Traditional Wear'].map(type => <option key={type} value={type} />)}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="custom-color" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Preferred Color / Palette *
                  </label>
                  <input
                    type="text"
                    required
                    value={preferredColor}
                    id="custom-color"
                    onChange={(e) => setPreferredColor(e.target.value)}
                    placeholder="e.g. Matte Black, Deep Bronze, Emerald"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div>
                  <label htmlFor="custom-occasion" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Occasion / Event
                  </label>
                  <input
                    type="text"
                    value={occasion}
                    id="custom-occasion"
                    onChange={(e) => setOccasion(e.target.value)}
                    placeholder="e.g. Everyday wear, work, wedding or celebration"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div>
                  <label htmlFor="custom-deadline" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Preferred Completion Deadline *
                  </label>
                  <input
                    type="date"
                    required
                    value={preferredDeadline}
                    id="custom-deadline"
                    onChange={(e) => setPreferredDeadline(e.target.value)}
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="custom-measurements" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Measurements or Standard Sizes (Inches / CM)
                  </label>
                  <textarea
                    rows={2}
                    value={measurements}
                    id="custom-measurements"
                    onChange={(e) => setMeasurements(e.target.value)}
                    placeholder="e.g. Chest: 40in, Waist: 32in, Height: 180cm (or 'I will visit the atelier in Kigali for custom fitting')"
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="custom-description" className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Your Design Idea *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={description}
                    id="custom-description"
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell us about the style, fabric, fit and details you’d love. It’s okay if you’re still exploring ideas."
                    className="w-full bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)]"
                  />
                </div>

                {/* Optional Reference sketch/photo upload */}
                <div className="sm:col-span-2">
                  <p className="block text-[11px] uppercase tracking-wider text-[var(--tone-a3a3a3)] mb-1">
                    Reference Image or Sketch (Optional)
                  </p>
                  <div className="border border-dashed border-[var(--tone-333333)] hover:border-[var(--tone-737373)] p-4 rounded text-center bg-[var(--tone-101010)]">
                    {referenceImage ? (
                      <div className="flex items-center justify-between gap-4">
                        <img src={referenceImage} alt="Your garment inspiration" className="w-20 h-24 object-contain" />
                        <span className="text-xs text-emerald-400">Image attached</span>
                        <button
                          type="button"
                          onClick={() => {setReferenceImage('');setUploadedImage(null);}}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-1.5 text-[var(--tone-a3a3a3)] hover:text-[var(--tone-ffffff)]">
                        <Upload size={18} />
                        <span className="text-xs">{readingImage ? 'Uploading image…' : 'Choose a photo or sketch'}</span>
                        <span className="text-[10px]">JPG, PNG or WebP · Up to 5 MB</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={readingImage}
                          onChange={handleImageUpload}
                          className="block w-full max-w-xs mt-2 text-xs"
                        />
                      </label>
                    )}
                  </div>
                  {imageError && <p role="alert" className="text-xs text-red-400 mt-2">{imageError}</p>}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--tone-222222)]">
                {submitError && <p role="alert" className="text-sm text-red-400 mb-4">{submitError}</p>}
                <button
                  type="submit"
                  disabled={!isBackendConfigured || submitting || readingImage}
                  className="w-full bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] py-3.5 font-bold text-xs uppercase tracking-[0.2em] transition-colors"
                >
                  {!isBackendConfigured ? 'Requests opening soon' : submitting ? 'Sending your request…' : 'Send custom request'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 2: Track Existing Custom Request */}
      {activeTab === 'track' && (
        <div className="max-w-2xl mx-auto space-y-8">
          <form onSubmit={handleTrackLookup} className="bg-[var(--tone-141414)] border border-[var(--tone-262626)] p-6 space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-[var(--tone-a3a3a3)] font-semibold flex items-center gap-1.5">
              <Search size={14} />
              <label htmlFor="custom-tracking-number">Find your custom request</label>
            </h3>
            <div className="flex gap-2">
              <input
                id="custom-tracking-number"
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter request number (e.g. REQ-2026-001)"
                className="min-w-0 flex-1 bg-[var(--tone-1a1a1a)] border border-[var(--tone-2e2e2e)] text-xs px-3.5 py-2.5 rounded text-[var(--tone-ffffff)] focus:outline-none focus:border-[var(--tone-ffffff)] font-mono"
              />
              <button
                type="submit"
                disabled={!isBackendConfigured || searchingTrack}
                className="bg-[var(--tone-ffffff)] hover:bg-[var(--tone-e5e5e5)] text-[var(--tone-000000)] px-6 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors"
              >
                {searchingTrack ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div className="text-[11px] text-[var(--tone-737373)]">
              Use your request number and private tracking token, or sign in to the account used to submit it.
            </div>
            <label className="block text-xs">Private tracking token<input className="w-full mt-2 p-3 bg-transparent border border-[var(--tone-333333)]" value={trackingToken} onChange={e=>setTrackingToken(e.target.value)} autoComplete="off" placeholder="Token saved after submission"/></label>
          </form>

          {trackingError && (
            <div className="p-4 bg-red-950/30 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{trackingError}</span>
            </div>
          )}

          {trackedRequest && (
            <div className="bg-[var(--tone-141414)] border border-[var(--tone-262626)] p-6 sm:p-8 space-y-6">
              {trackedRequest.status==='CANCELLED'&&<p role="status" className="text-red-300">This request has been cancelled.</p>}
              <p className="text-xs">Updates refresh every 10 seconds. The preferred deadline is a request, not an accepted completion promise.</p>
              <div className="flex justify-between items-start border-b border-[var(--tone-222222)] pb-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--tone-a3a3a3)]">
                    Custom Request Details
                  </span>
                  <h3 className="font-heading text-xl font-bold text-[var(--tone-ffffff)]">
                    #{trackedRequest.request_number}
                  </h3>
                  <p className="text-xs text-[var(--tone-d4d4d4)] mt-0.5">{trackedRequest.clothing_type}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--tone-737373)] block">
                    Current Stage
                  </span>
                  <span className="inline-block px-3 py-1 bg-[var(--tone-181818)]/20 text-[var(--tone-f5f5f5)] border border-[var(--tone-404040)]/40 font-bold text-xs uppercase tracking-wider mt-1">
                    {trackedRequest.status}
                  </span>
                </div>
              </div>

              {/* Progress Pipeline */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--tone-a3a3a3)] block mb-3">
                  Atelier Production Pipeline
                </span>
                <div className="flex items-center justify-between overflow-x-auto pb-2 gap-2">
                  {statusPipeline.map((step, idx) => {
                    const currentIdx = getStatusIndex(trackedRequest.status);
                    const isPassed = idx <= currentIdx;
                    const isCurrent = idx === currentIdx;

                    return (
                      <div key={step} className="flex-1 min-w-[70px] text-center">
                        <div
                          className={`h-1.5 w-full mb-2 transition-colors ${
                            isPassed ? 'bg-[var(--tone-f5f5f5)]' : 'bg-[var(--tone-262626)]'
                          }`}
                        />
                        <span
                          className={`text-[9px] uppercase tracking-wider block font-semibold ${
                            isCurrent
                              ? 'text-[var(--tone-f5f5f5)]'
                              : isPassed
                              ? 'text-[var(--tone-ffffff)]'
                              : 'text-[var(--tone-525252)]'
                          }`}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Details breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-[var(--tone-0d0d0d)] p-4 border border-[var(--tone-222222)]">
                <div>
                  <span className="text-[var(--tone-737373)] block">Client:</span>
                  <span className="text-[var(--tone-ffffff)] font-medium">{trackedRequest.full_name} ({trackedRequest.phone})</span>
                </div>
                <div>
                  <span className="text-[var(--tone-737373)] block">Occasion:</span>
                  <span className="text-[var(--tone-ffffff)] font-medium">{trackedRequest.occasion || 'General Bespoke'}</span>
                </div>
                <div>
                  <span className="text-[var(--tone-737373)] block">Preferred Color:</span>
                  <span className="text-[var(--tone-ffffff)] font-medium">{trackedRequest.preferred_color}</span>
                </div>
                <div>
                  <span className="text-[var(--tone-737373)] block">Deadline:</span>
                  <span className="text-[var(--tone-ffffff)] font-medium">{trackedRequest.preferred_deadline}</span>
                </div>
                {trackedRequest.notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-[var(--tone-1c1c1c)]">
                    <span className="text-[var(--tone-f5f5f5)] font-semibold block mb-0.5">Master Tailor Note:</span>
                    <span className="text-[var(--tone-d4d4d4)] italic">{trackedRequest.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
