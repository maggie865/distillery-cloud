import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { BookOpen, GraduationCap, ExternalLink, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const BRIGHTHR_LOGIN_URL = 'https://login.brighthr.com/login/';

export default function TeamHub() {
  const navigate = useNavigate();

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => db.AppSettings.list('key', 5000),
  });
  const notionConnected = !!appSettings.find((s) => s.key === 'notion_sops_database_id')?.value;

  const { data: staff = [] } = useQuery({ queryKey: ['staffMembers'], queryFn: () => db.StaffMember.list('full_name', 1000) });
  const activeStaffCount = staff.filter((s) => s.active).length;

  const tiles = [
    {
      key: 'sops',
      label: 'SOPs',
      description: notionConnected ? 'Standard operating procedures, synced from Notion' : 'Not connected yet — see Settings → Compliance',
      icon: BookOpen,
      tone: 'bg-primary/10 text-primary',
      onClick: () => navigate('/sops'),
    },
    {
      key: 'training',
      label: 'Staff Training',
      description: 'Sign-off tracking and quizzes across all training programs',
      icon: GraduationCap,
      tone: 'bg-info/10 text-info',
      stat: `${activeStaffCount} active staff`,
      onClick: () => navigate('/staff-training'),
    },
    {
      key: 'brighthr',
      label: 'Bright HR',
      description: 'Timesheets, leave, and health & safety records',
      icon: ExternalLink,
      tone: 'bg-muted text-muted-foreground',
      external: true,
      onClick: () => window.open(BRIGHTHR_LOGIN_URL, '_blank', 'noopener,noreferrer'),
    },
  ];

  return (
    <div>
      <PageHeader title="Team Hub" subtitle="SOPs, training, and quick links for the whole team, in one place" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <button key={t.key} onClick={t.onClick} className="text-left">
            <Card className="p-6 h-full flex flex-col gap-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${t.tone}`}>
                  <t.icon className="w-5 h-5" />
                </div>
                {t.external ? <ExternalLink className="w-4 h-4 text-muted-foreground mt-1" /> : <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{t.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
              </div>
              {t.stat && <p className="text-xs font-medium text-muted-foreground mt-auto pt-2 border-t border-border">{t.stat}</p>}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
