import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Plus } from "lucide-react";
import type {
  AdminSettings,
  ElementDefinition,
  DreamHomeFinish,
  DreamHomePrice,
  TallHeight,
  PricingSettings,
} from "@shared/schema";

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });
  const { data: elementDefs, isLoading: elementDefsLoading } = useQuery<ElementDefinition[]>({
    queryKey: ["/api/element-definitions"],
  });

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<AdminSettings>) => apiRequest("PUT", "/api/admin/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Settings saved" });
    },
  });

  const elementDefMutation = useMutation({
    mutationFn: (data: { id: number } & Partial<ElementDefinition>) => {
      const { id, ...rest } = data;
      return apiRequest("PUT", `/api/element-definitions/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/element-definitions"] });
      toast({ title: "Element saved" });
    },
  });

  const addElementDefMutation = useMutation({
    mutationFn: (data: Partial<ElementDefinition>) =>
      apiRequest("POST", "/api/element-definitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/element-definitions"] });
      toast({ title: "Element added" });
    },
  });

  const isLoading = settingsLoading;

  return (
    <div className="min-h-screen bg-background" data-testid="admin-page">
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-card-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Manage pricing, finishing options, and branding</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="pricing">
            <TabsList className="mb-6">
              <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
              <TabsTrigger value="elements" data-testid="tab-elements">Elements</TabsTrigger>
              <TabsTrigger value="branding" data-testid="tab-branding">Branding</TabsTrigger>
              <TabsTrigger value="snap" data-testid="tab-snap">Snap Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="pricing">
              <div className="space-y-6">
                <PricingSettingsCard />
                <DreamHomeMatrixCard />
                <TallHeightsCard />
                <FinishesCard />
              </div>
            </TabsContent>

            <TabsContent value="elements">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Element Definitions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {elementDefsLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <>
                      {(elementDefs ?? []).map((def) => (
                        <ElementDefRow
                          key={def.id}
                          def={def}
                          onSave={(data) => elementDefMutation.mutate({ id: def.id, ...data })}
                          isPending={elementDefMutation.isPending}
                        />
                      ))}
                      <Separator />
                      <NewElementDefRow
                        onAdd={(data) => addElementDefMutation.mutate(data)}
                        isPending={addElementDefMutation.isPending}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding">
              <BrandingForm
                settings={settings!}
                onSave={(data) => settingsMutation.mutate(data)}
                isPending={settingsMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="snap">
              <SnapForm
                settings={settings!}
                onSave={(data) => settingsMutation.mutate(data)}
                isPending={settingsMutation.isPending}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function PricingSettingsCard() {
  const { toast } = useToast();
  const { data: settings } = useQuery<PricingSettings>({ queryKey: ["/api/pricing-settings"] });

  const mutation = useMutation({
    mutationFn: (data: Partial<PricingSettings>) => apiRequest("PUT", "/api/pricing-settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-settings"] });
      toast({ title: "Pricing settings saved" });
    },
  });

  if (!settings) return <Skeleton className="h-40 w-full" />;

  const fields: { key: keyof PricingSettings; label: string }[] = [
    { key: "fxRate", label: "FX Rate (CNY → AED)" },
    { key: "packingMult", label: "Packing Multiplier" },
    { key: "shippingMult", label: "Shipping Multiplier" },
    { key: "marginDiv", label: "Margin Divisor" },
    { key: "decorativeCnyPerM2", label: "Decorative Panel CNY/m²" },
    { key: "drawerFlatAed", label: "Drawer Flat AED" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pricing Settings</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Formula: CNY × FX × packing × shipping ÷ margin = AED
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(({ key, label }) => (
            <div key={String(key)} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input
                type="number"
                step="0.01"
                defaultValue={String(settings[key])}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== String(settings[key])) {
                    mutation.mutate({ [key]: val } as Partial<PricingSettings>);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DreamHomeMatrixCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: prices = [] } = useQuery<DreamHomePrice[]>({ queryKey: ["/api/dream-home/prices"] });

  const upsert = useMutation({
    mutationFn: (data: { cabinetType: string; finishId: number; priceCnyPerM: string }) =>
      apiRequest("PUT", "/api/dream-home/prices", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/prices"] }),
  });

  const getPrice = (type: string, fid: number): string => {
    const row = prices.find((p) => p.cabinetType === type && p.finishId === fid);
    return row ? String(row.priceCnyPerM) : "";
  };

  const rows = [
    { key: "base", label: "Base Cabinet" },
    { key: "wall_cabinet", label: "Wall Cabinet" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dream Home Prices (CNY / linear meter)</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Base Cabinet standard: 670×550 mm · Wall Cabinet standard: 700×330 mm · Surcharge: +10% per 100mm over standard
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-border px-2 py-1 bg-orange-100 text-left sticky left-0 z-10">Cabinet</th>
                {finishes.map((f) => (
                  <th key={f.id} className="border border-border px-2 py-1 bg-yellow-100 min-w-[110px] text-center">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="border border-border px-2 py-1 bg-orange-50 font-medium sticky left-0 z-10 whitespace-nowrap">
                    {row.label}
                  </td>
                  {finishes.map((f) => {
                    const current = getPrice(row.key, f.id);
                    return (
                      <td key={f.id} className="border border-border bg-blue-50 p-0.5">
                        <Input
                          type="number"
                          defaultValue={current}
                          className="h-7 text-xs text-center"
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== current) {
                              upsert.mutate({
                                cabinetType: row.key,
                                finishId: f.id,
                                priceCnyPerM: e.target.value,
                              });
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TallHeightsCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: tallRows = [] } = useQuery<TallHeight[]>({ queryKey: ["/api/dream-home/tall-heights"] });

  const upsert = useMutation({
    mutationFn: (data: { source: string; heightMm: number; finishId: number; priceCnyPerM: string }) =>
      apiRequest("PUT", "/api/dream-home/tall-heights", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/tall-heights"] }),
  });

  const getPrice = (h: number, fid: number): string => {
    const row = tallRows.find((r) => r.heightMm === h && r.finishId === fid);
    return row ? String(row.priceCnyPerM) : "";
  };

  const heights = [
    { mm: 1900, source: "dream_home" as const },
    { mm: 2000, source: "dream_home" as const },
    { mm: 2100, source: "dream_home" as const },
    { mm: 2200, source: "dream_home" as const },
    { mm: 2400, source: "dream_home" as const },
    { mm: 2600, source: "dream_home" as const },
    { mm: 2700, source: "platinum" as const },
    { mm: 2800, source: "platinum" as const },
    { mm: 2900, source: "platinum" as const },
    { mm: 3000, source: "platinum" as const },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tall Cabinet Heights (CNY / linear meter)</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Dream Home: 1900–2600 mm · Platinum fallback: 2700–3000 mm · User height snaps UP to next listed row
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-border px-2 py-1 bg-orange-100 sticky left-0 z-10">Source</th>
                <th className="border border-border px-2 py-1 bg-orange-100">Height</th>
                {finishes.map((f) => (
                  <th key={f.id} className="border border-border px-2 py-1 bg-yellow-100 min-w-[100px] text-center">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heights.map(({ mm, source }) => {
                const bg = source === "platinum" ? "bg-purple-50" : "bg-orange-50";
                return (
                  <tr key={mm}>
                    <td className={`border border-border px-2 py-1 ${bg} sticky left-0 z-10 font-medium text-[10px] uppercase`}>
                      {source === "platinum" ? "Platinum" : "Dream Home"}
                    </td>
                    <td className={`border border-border px-2 py-1 ${bg} font-medium whitespace-nowrap`}>
                      {mm} mm
                    </td>
                    {finishes.map((f) => {
                      const current = getPrice(mm, f.id);
                      return (
                        <td key={f.id} className="border border-border bg-blue-50 p-0.5">
                          <Input
                            type="number"
                            defaultValue={current}
                            className="h-7 text-xs text-center"
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== current) {
                                upsert.mutate({
                                  source,
                                  heightMm: mm,
                                  finishId: f.id,
                                  priceCnyPerM: e.target.value,
                                });
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function FinishesCard() {
  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });

  const mutation = useMutation({
    mutationFn: (data: { id: number; name: string }) =>
      apiRequest("PUT", `/api/dream-home/finishes/${data.id}`, { name: data.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dream-home/finishes"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Finishes (11)</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Rename only. The 11 Dream Home finishes are fixed.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {finishes.map((f) => (
          <div key={f.id} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-6">#{f.sortOrder}</span>
            <Input
              defaultValue={f.name}
              className="flex-1"
              onBlur={(e) => {
                if (e.target.value && e.target.value !== f.name) {
                  mutation.mutate({ id: f.id, name: e.target.value });
                }
              }}
            />
            <span className="text-[10px] text-muted-foreground w-40 truncate">{f.system}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const ELEMENT_CATEGORIES = ["electrical", "plumbing", "appliance"];
const CATEGORY_COLORS: Record<string, string> = {
  electrical: "bg-amber-100 text-amber-700",
  plumbing:   "bg-blue-100 text-blue-700",
  appliance:  "bg-purple-100 text-purple-700",
};

function ElementDefRow({
  def,
  onSave,
  isPending,
}: {
  def: ElementDefinition;
  onSave: (data: Partial<ElementDefinition>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(def.name);
  const [icon, setIcon] = useState(def.icon);
  const [isActive, setIsActive] = useState(def.isActive);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-base w-6 text-center">{icon}</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-32"
        placeholder="Name"
      />
      <Input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        className="w-16 text-center"
        placeholder="Emoji"
      />
      <Badge className={`text-xs ${CATEGORY_COLORS[def.category] ?? ""}`}>
        {def.category}
      </Badge>
      <div className="flex items-center gap-1.5">
        <Switch
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v);
            onSave({ isActive: v });
          }}
        />
        <span className="text-xs text-muted-foreground">Active</span>
      </div>
      <Button
        size="sm"
        onClick={() => onSave({ name, icon, isActive })}
        disabled={isPending}
      >
        <Save className="w-3 h-3 mr-1" />
        Save
      </Button>
    </div>
  );
}

function NewElementDefRow({
  onAdd,
  isPending,
}: {
  onAdd: (data: Partial<ElementDefinition>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState("electrical");
  const [defaultWidth, setDefaultWidth] = useState("60");
  const [defaultDepth, setDefaultDepth] = useState("60");

  const handleAdd = () => {
    if (!name || !icon) return;
    onAdd({ name, icon, category, defaultWidth: parseInt(defaultWidth), defaultDepth: parseInt(defaultDepth), isActive: true });
    setName(""); setIcon("");
  };

  return (
    <div className="flex items-center gap-3 flex-wrap pt-2">
      <Label className="text-xs text-muted-foreground w-8">New</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} className="w-32" placeholder="Name" />
      <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-16 text-center" placeholder="Emoji" />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ELEMENT_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={defaultWidth} onChange={(e) => setDefaultWidth(e.target.value)} className="w-16" type="number" placeholder="W cm" />
      <Input value={defaultDepth} onChange={(e) => setDefaultDepth(e.target.value)} className="w-16" type="number" placeholder="D cm" />
      <Button size="sm" onClick={handleAdd} disabled={isPending || !name || !icon}>
        <Plus className="w-3 h-3 mr-1" />
        Add
      </Button>
    </div>
  );
}

function BrandingForm({
  settings,
  onSave,
  isPending,
}: {
  settings: AdminSettings;
  onSave: (data: Partial<AdminSettings>) => void;
  isPending: boolean;
}) {
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || "");
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [footerText, setFooterText] = useState(settings.footerText);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Company Name</Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            data-testid="input-company-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Logo URL</Label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            data-testid="input-logo-url"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Primary Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-9 w-14 rounded-md border border-input cursor-pointer"
              data-testid="input-primary-color"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-32"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Footer Text</Label>
          <Input
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            data-testid="input-footer-text"
          />
        </div>
        <Separator />
        <Button
          onClick={() =>
            onSave({ companyName, logoUrl, primaryColor, footerText })
          }
          disabled={isPending}
          data-testid="button-save-branding"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Branding
        </Button>
      </CardContent>
    </Card>
  );
}

function SnapForm({
  settings,
  onSave,
  isPending,
}: {
  settings: AdminSettings;
  onSave: (data: Partial<AdminSettings>) => void;
  isPending: boolean;
}) {
  const [gridEnabled, setGridEnabled] = useState(settings.gridEnabled);
  const [midpointEnabled, setMidpointEnabled] = useState(settings.midpointEnabled);
  const [snapRadius, setSnapRadius] = useState(settings.snapRadius);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Snap Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Grid Snapping</Label>
            <p className="text-[10px] text-muted-foreground">Enable snapping to grid points</p>
          </div>
          <Switch
            checked={gridEnabled}
            onCheckedChange={setGridEnabled}
            data-testid="switch-grid"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Midpoint Snapping</Label>
            <p className="text-[10px] text-muted-foreground">Enable snapping to wall midpoints</p>
          </div>
          <Switch
            checked={midpointEnabled}
            onCheckedChange={setMidpointEnabled}
            data-testid="switch-midpoint"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Snap Radius: {snapRadius}px</Label>
          <Slider
            value={[snapRadius]}
            min={4}
            max={24}
            step={1}
            onValueChange={([v]) => setSnapRadius(v)}
            data-testid="slider-snap-radius"
          />
        </div>
        <Separator />
        <Button
          onClick={() => onSave({ gridEnabled, midpointEnabled, snapRadius })}
          disabled={isPending}
          data-testid="button-save-snap"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Snap Settings
        </Button>
      </CardContent>
    </Card>
  );
}
