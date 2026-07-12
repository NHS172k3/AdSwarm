import { CampaignStudio } from "@/components/campaign-studio";
import { CONFIG } from "@/lib/config";

export default function Page() {
  return <CampaignStudio initialMode={CONFIG.PAYMENT_MODE} />;
}
