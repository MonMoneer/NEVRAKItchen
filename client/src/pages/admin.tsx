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
import { ArrowLeft, Save, Trash2, Plus } from "lucide-react";
import type { AdminSettings, PricingConfig, FinishingOption, ElementDefinition } from "@shared/schema";

const cabinetLabels: Record<string, string> = {
  base: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall: "Tall Cabinet",
};

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<AdminSettings>({
    queryKey: ["/api/admin/settings"],
  });
  const { data: pricing, isLoading: pricingLoading } = useQuery<PricingConfig[]>({
    queryKey: ["/api/pricing"],
  });
  const { data: finishingOptions, isLoading: finishingLoading } = useQuery<FinishingOption[]>({
    queryKey: ["/api/finishing-options"],
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

  const pricingMutation = useMutation({
    mutationFn: (data: { id: number } & Partial<PricingConfig>) =>
      apiRequest("PUT", "/api/pricing", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "Pricing saved" });
    },
  });

  const finishingMutation = useMutation({
    mutationFn: (data: { id: number } & Partial<FinishingOption>) =>
      apiRequest("PUT", "/api/finishing-options", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finishing-options"] });
      toast({ title: "Finishing option saved" });
    },
  });

  const addPricingMutation = useMutation({
    mutationFn: (data: Partial<PricingConfig>) => apiRequest("POST", "/api/pricing", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "Added new pricing" });
    },
  });

  const deletePricingMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/pricing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing"] });
      toast({ title: "Pricing option deleted" });
    },
  });

  const addFinishingMutation = useMutation({
    mutationFn: (data: Partial<FinishingOption>) => apiRequest("POST", "/api/finishing-options", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finishing-options"] });
      toast({ title: "Added new finishing option" });
    },
  });

  const deleteFinishingMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/finishing-options/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finishing-options"] });
      toast({ title: "Finishing option deleted" });
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

  const isLoading = settingsLoading || pricingLoading || finishingLoading;

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
              <TabsTrigger value="finishing" data-testid="tab-finishing">Finishing Options</TabsTrigger>
              <TabsTrigger value="elements" data-testid="tab-elements">Elements</TabsTrigger>
              <TabsTrigger value="branding" data-testid="tab-branding">Branding</TabsTrigger>
              <TabsTrigger value="snap" data-testid="tab-snap">Snap Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="pricing">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pricing per Meter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pricing?.map((config) => (
                    <PricingRow
                      key={config.id}
                      config={config}
                      onSave={(data) =>
                        pricingMutation.mutate({ id: config.id, ...data })
                      }
                      onDelete={() => deletePricingMutation.mutate(config.id)}
                      isPending={pricingMutation.isPending || deletePricingMutation.isPending}
                    />
                  ))}
                  <Separator />
                  <NewPricingRow
                    onAdd={(data) => addPricingMutation.mutate(data)}
                    isPending={addPricingMutation.isPending}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finishing">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Finishing Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {finishingOptions?.map((option) => (
                    <FinishingRow
                      key={option.id}
                      option={option}
                      onSave={(data) =>
                        finishingMutation.mutate({ id: option.id, ...data })
                      }
                      onDelete={() => deleteFinishingMutation.mutate(option.id)}
                      isPending={finishingMutation.isPending || deleteFinishingMutation.isPending}
                    />
                  ))}
                  <Separator />
                  <NewFinishingRow
                    onAdd={(data) => addFinishingMutation.mutate(data)}
                    isPending={addFinishingMutation.isPending}
                  />
                </CardContent>
              </Card>
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

function PricingRow({
  config,
  onSave,
  onDelete,
  isPending,
}: {
  config: PricingConfig;
  onSave: (data: Partial<PricingConfig>) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [price, setPrice] = useState(config.pricePerMeter);

  return (
    <div className="flex items-center gap-4">
      <Label className="w-32 text-sm shrink-0">
        {cabinetLabels[config.unitType] || config.unitType}
      </Label>
      <Input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-32"
        data-testid={`input-price-${config.unitType}`}
      />
      <span className="text-xs text-muted-foreground shrink-0">{config.currency}/m</span>
      <Button
        size="sm"
        onClick={() => onSave({ pricePerMeter: price })}
        disabled={isPending}
        data-testid={`button-save-price-${config.unitType}`}
      >
        <Save className="w-3 h-3 mr-1" />
        Save
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={onDelete}
        disabled={isPending}
        data-testid={`button-delete-price-${config.unitType}`}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

function NewPricingRow({
  onAdd,
  isPending,
}: {
  onAdd: (data: { unitType: string; pricePerMeter: string; currency: string }) => void;
  isPending: boolean;
}) {
  const [unitType, setUnitType] = useState<string>("base");
  const [price, setPrice] = useState("");

  const handleAdd = () => {
    if (!price) return;
    onAdd({
      unitType,
      pricePerMeter: price,
      currency: "AED"
    });
    setPrice("");
  };

  return (
    <div className="flex items-center gap-4 pt-2">
      <div className="w-32 shrink-0">
        <Select value={unitType} onValueChange={setUnitType}>
          <SelectTrigger className="w-full text-sm h-9">
            <SelectValue placeholder="Cabinet Type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(cabinetLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-32"
        placeholder="Price"
        data-testid={`input-new-price`}
      />
      <span className="text-xs text-muted-foreground shrink-0">AED/m</span>
      <Button
        size="sm"
        onClick={handleAdd}
        disabled={isPending || !price}
        data-testid={`button-add-price`}
      >
        <Plus className="w-3 h-3 mr-1" />
        Add Item
      </Button>
    </div>
  );
}

function FinishingRow({
  option,
  onSave,
  onDelete,
  isPending,
}: {
  option: FinishingOption;
  onSave: (data: Partial<FinishingOption>) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState(option.label);
  const [multiplier, setMultiplier] = useState(option.multiplier);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Label className="w-8 text-sm shrink-0">#{option.sortOrder}</Label>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-40"
        placeholder="Label"
        data-testid={`input-finishing-label-${option.id}`}
      />
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">x</span>
        <Input
          type="number"
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
          className="w-24"
          step="0.1"
          data-testid={`input-finishing-mult-${option.id}`}
        />
      </div>
      <Button
        size="sm"
        onClick={() => onSave({ label, multiplier })}
        disabled={isPending}
        data-testid={`button-save-finishing-${option.id}`}
      >
        <Save className="w-3 h-3 mr-1" />
        Save
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={onDelete}
        disabled={isPending}
        data-testid={`button-delete-finishing-${option.id}`}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

function NewFinishingRow({
  onAdd,
  isPending,
}: {
  onAdd: (data: { label: string; multiplier: string; sortOrder: number }) => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState("");
  const [multiplier, setMultiplier] = useState("1.0");

  const handleAdd = () => {
    if (!label || !multiplier) return;
    onAdd({
      label,
      multiplier,
      sortOrder: 0
    });
    setLabel("");
    setMultiplier("1.0");
  };

  return (
    <div className="flex items-center gap-4 flex-wrap pt-2">
      <Label className="w-8 text-sm shrink-0 text-muted-foreground">New</Label>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-40"
        placeholder="Finish Name"
        data-testid={`input-new-finishing-label`}
      />
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">x</span>
        <Input
          type="number"
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
          className="w-24"
          step="0.1"
          data-testid={`input-new-finishing-mult`}
        />
      </div>
      <Button
        size="sm"
        onClick={handleAdd}
        disabled={isPending || !label || !multiplier}
        data-testid={`button-add-finishing`}
      >
        <Plus className="w-3 h-3 mr-1" />
        Add Finish
      </Button>
    </div>
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
