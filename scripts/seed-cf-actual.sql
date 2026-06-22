-- Phase 5A: idempotent CF_Actual + CAPEX structure seed for Tsavkisi Heights.
-- Generated from reference/CF_Actual (exact labels) + approved CAPEX English translations.
-- Replaces the active structure IN PLACE. Run via the admin SQL path (MCP).
-- Nodes: section=3 group=17 class(leaf)=87 total=107.
-- CAPEX sits under 'Total Technical' (t_tech) so it rolls into the Total Technical subtotal.
begin;
create temp table _sales on commit drop as
  select t.id, t.classification_source
  from transactions t join cf_nodes c on c.id = t.class_id
  where t.company_id = 'd98b696b-8b99-411d-b3d0-a4a9eb12b15a'
    and c.label in ('Land Plot Sales','Cash inflows from sales');
delete from cf_nodes where company_id = 'd98b696b-8b99-411d-b3d0-a4a9eb12b15a' and structure_version_id = '43bff1d1-a2ce-420b-ae0a-0d60d6a5e6d0';
create temp table _n (k text primary key, parent_k text, kind cf_node_kind, label text, dir cash_direction, ord int) on commit drop;
insert into _n (k,parent_k,kind,label,dir,ord) values
  ('s_ops', NULL, 'section'::cf_node_kind, 'Cash flows from operations:', 'neutral'::cash_direction, 4),
  ('s_inv', NULL, 'section'::cf_node_kind, 'Cash flows from investing activities', 'neutral'::cash_direction, 89),
  ('s_fin', NULL, 'section'::cf_node_kind, 'Cash flows from financing activities', 'neutral'::cash_direction, 94),
  ('t_ops', 's_ops', 'group'::cf_node_kind, 'Total cash flows from operations', 'neutral'::cash_direction, 87),
  ('t_admin', 'g_outflows', 'group'::cf_node_kind, 'Total Administrative', 'neutral'::cash_direction, 20),
  ('t_tech', 'g_outflows', 'group'::cf_node_kind, 'Total Technical', 'neutral'::cash_direction, 56),
  ('t_mktg', 'g_outflows', 'group'::cf_node_kind, 'Total Marketing', 'neutral'::cash_direction, 84),
  ('t_inv', 's_inv', 'group'::cf_node_kind, 'Total Cash flows from investing activities', 'neutral'::cash_direction, 92),
  ('t_fin', 's_fin', 'group'::cf_node_kind, 'Total Cash flows from financing activities', 'neutral'::cash_direction, 98),
  ('g_inflows', 't_ops', 'group'::cf_node_kind, 'Inflows', 'neutral'::cash_direction, 6),
  ('g_outflows', 't_ops', 'group'::cf_node_kind, 'Outflows', 'neutral'::cash_direction, 10),
  ('g_online', 't_mktg', 'group'::cf_node_kind, 'Online/Digital channels', 'neutral'::cash_direction, 59),
  ('g_offline', 't_mktg', 'group'::cf_node_kind, 'Offline channels', 'neutral'::cash_direction, 71),
  ('g_other', 't_mktg', 'group'::cf_node_kind, 'Other creative & support services', 'neutral'::cash_direction, 80),
  ('l7', 'g_inflows', 'class'::cf_node_kind, 'Cash inflows from sales', 'in'::cash_direction, 7),
  ('l8', 'g_inflows', 'class'::cf_node_kind, 'VAT refund', 'in'::cash_direction, 8),
  ('l11', 't_admin', 'class'::cf_node_kind, 'VAT', 'out'::cash_direction, 11),
  ('l12', 't_admin', 'class'::cf_node_kind, 'Salaries', 'out'::cash_direction, 12),
  ('l13', 't_admin', 'class'::cf_node_kind, 'Sales Bonuses', 'out'::cash_direction, 13),
  ('l14', 't_admin', 'class'::cf_node_kind, 'Property tax', 'out'::cash_direction, 14),
  ('l15', 't_admin', 'class'::cf_node_kind, 'Advances paid', 'out'::cash_direction, 15),
  ('l16', 't_admin', 'class'::cf_node_kind, 'Accounting service', 'out'::cash_direction, 16),
  ('l17', 't_admin', 'class'::cf_node_kind, 'Land valuation', 'out'::cash_direction, 17),
  ('l18', 't_admin', 'class'::cf_node_kind, 'Bank commissions', 'out'::cash_direction, 18),
  ('l19', 't_admin', 'class'::cf_node_kind, 'Other administrative expenses', 'out'::cash_direction, 19),
  ('l24', 't_tech', 'class'::cf_node_kind, 'Hydro geological research', 'out'::cash_direction, 24),
  ('l25', 't_tech', 'class'::cf_node_kind, 'Conceptual development plan (competition - 3 versions)', 'out'::cash_direction, 25),
  ('l26', 't_tech', 'class'::cf_node_kind, 'Consulting services', 'out'::cash_direction, 26),
  ('l27', 't_tech', 'class'::cf_node_kind, 'Urban Development Regulation Plan (UDRP)', 'out'::cash_direction, 27),
  ('l28', 't_tech', 'class'::cf_node_kind, 'Speeding up UDRP process stage 1 (official payment)', 'out'::cash_direction, 28),
  ('l29', 't_tech', 'class'::cf_node_kind, 'Speeding up UDRP process stage 2 (official payment)', 'out'::cash_direction, 29),
  ('l30', 't_tech', 'class'::cf_node_kind, 'Shape files for UDRP and register', 'out'::cash_direction, 30),
  ('l31', 't_tech', 'class'::cf_node_kind, 'Arial Photo Shooting', 'out'::cash_direction, 31),
  ('l32', 't_tech', 'class'::cf_node_kind, 'Topographical survey', 'out'::cash_direction, 32),
  ('l33', 't_tech', 'class'::cf_node_kind, 'Topographical survey expansion (50K m2)', 'out'::cash_direction, 33),
  ('l34', 't_tech', 'class'::cf_node_kind, 'Transport scheme planning', 'out'::cash_direction, 34),
  ('l35', 't_tech', 'class'::cf_node_kind, 'Geological study', 'out'::cash_direction, 35),
  ('l36', 't_tech', 'class'::cf_node_kind, 'Test materials / Samples', 'out'::cash_direction, 36),
  ('l37', 't_tech', 'class'::cf_node_kind, 'BOQ & Expert Assessments', 'out'::cash_direction, 37),
  ('l38', 't_tech', 'class'::cf_node_kind, 'Septic Systems Project Contract', 'out'::cash_direction, 38),
  ('l39', 't_tech', 'class'::cf_node_kind, 'GIS shape file zoning distribution', 'out'::cash_direction, 39),
  ('l40', 't_tech', 'class'::cf_node_kind, 'GIS file registration in NAPR', 'out'::cash_direction, 40),
  ('l41', 't_tech', 'class'::cf_node_kind, 'Tree taxation part 1', 'out'::cash_direction, 41),
  ('l42', 't_tech', 'class'::cf_node_kind, 'Tree taxation part two', 'out'::cash_direction, 42),
  ('l43', 't_tech', 'class'::cf_node_kind, 'Dendrologic project (optional)', 'out'::cash_direction, 43),
  ('l44', 't_tech', 'class'::cf_node_kind, 'Vertical planning project', 'out'::cash_direction, 44),
  ('l45', 't_tech', 'class'::cf_node_kind, 'Land marking', 'out'::cash_direction, 45),
  ('l46', 't_tech', 'class'::cf_node_kind, 'Arrangement of site security (Fence / Cameras)', 'out'::cash_direction, 46),
  ('l47', 't_tech', 'class'::cf_node_kind, 'Arrangement of security/sales building', 'out'::cash_direction, 47),
  ('l48', 't_tech', 'class'::cf_node_kind, 'Site cleaning from selected bushes', 'out'::cash_direction, 48),
  ('l49', 't_tech', 'class'::cf_node_kind, 'Design guidline', 'out'::cash_direction, 49),
  ('l50', 't_tech', 'class'::cf_node_kind, '3D model with houses', 'out'::cash_direction, 50),
  ('l51', 't_tech', 'class'::cf_node_kind, 'Roads project (detailed)', 'out'::cash_direction, 51),
  ('l52', 't_tech', 'class'::cf_node_kind, 'MEP project', 'out'::cash_direction, 52),
  ('l53', 't_tech', 'class'::cf_node_kind, 'Natural gas project', 'out'::cash_direction, 53),
  ('l54', 't_tech', 'class'::cf_node_kind, 'Public Area Project (detailed)', 'out'::cash_direction, 54),
  ('l55', 't_tech', 'class'::cf_node_kind, 'Telecommunications (Magti)', 'out'::cash_direction, 55),
  ('l60', 'g_online', 'class'::cf_node_kind, 'Project Webpage ', 'out'::cash_direction, 60),
  ('l61', 'g_online', 'class'::cf_node_kind, 'Landing Page', 'out'::cash_direction, 61),
  ('l62', 'g_online', 'class'::cf_node_kind, 'SEO Optimisation', 'out'::cash_direction, 62),
  ('l63', 'g_online', 'class'::cf_node_kind, 'Project CRM Procurement', 'out'::cash_direction, 63),
  ('l64', 'g_online', 'class'::cf_node_kind, 'Technical support (Web & CRM)', 'out'::cash_direction, 64),
  ('l65', 'g_online', 'class'::cf_node_kind, 'Digital Support', 'out'::cash_direction, 65),
  ('l66', 'g_online', 'class'::cf_node_kind, 'Digital Boost', 'out'::cash_direction, 66),
  ('l67', 'g_online', 'class'::cf_node_kind, 'Content creation ', 'out'::cash_direction, 67),
  ('l68', 'g_online', 'class'::cf_node_kind, 'Other Marketing activites (TV, Advert. Print Media, Photo Shooting)', 'out'::cash_direction, 68),
  ('l69', 'g_online', 'class'::cf_node_kind, 'Gifts', 'out'::cash_direction, 69),
  ('l72', 'g_offline', 'class'::cf_node_kind, 'Printing Materials for Sales', 'out'::cash_direction, 72),
  ('l73', 'g_offline', 'class'::cf_node_kind, 'Outdoor Placements', 'out'::cash_direction, 73),
  ('l74', 'g_offline', 'class'::cf_node_kind, 'Land marking / signposts', 'out'::cash_direction, 74),
  ('l75', 'g_offline', 'class'::cf_node_kind, 'Sales office rent', 'out'::cash_direction, 75),
  ('l76', 'g_offline', 'class'::cf_node_kind, 'Sales office furnishing', 'out'::cash_direction, 76),
  ('l77', 'g_offline', 'class'::cf_node_kind, 'Launching Campaign/Event/other costs', 'out'::cash_direction, 77),
  ('l78', 'g_offline', 'class'::cf_node_kind, 'Colaborations (Banks, Influencers, etc.)', 'out'::cash_direction, 78),
  ('l81', 'g_other', 'class'::cf_node_kind, 'Branding Strategy+Brand Book+Activation Plan', 'out'::cash_direction, 81),
  ('l82', 'g_other', 'class'::cf_node_kind, 'Renders', 'out'::cash_direction, 82),
  ('l83', 'g_other', 'class'::cf_node_kind, 'Graphic designer', 'out'::cash_direction, 83),
  ('l86', 'g_outflows', 'class'::cf_node_kind, 'Contingency (PS) - 5%', 'out'::cash_direction, 86),
  ('l91', 't_inv', 'class'::cf_node_kind, 'Plant & equipment', 'out'::cash_direction, 91),
  ('l95', 't_fin', 'class'::cf_node_kind, 'Borrowings', 'in'::cash_direction, 95),
  ('l96', 't_fin', 'class'::cf_node_kind, 'Repayment of borrowings', 'out'::cash_direction, 96),
  ('l97', 't_fin', 'class'::cf_node_kind, 'Capital contributions', 'in'::cash_direction, 97),
  ('capex', 't_tech', 'group'::cf_node_kind, 'CAPEX', 'neutral'::cash_direction, 100),
  ('cx_cube', 'capex', 'group'::cf_node_kind, 'Cube Construction', 'neutral'::cash_direction, 101),
  ('cx_gwp', 'capex', 'group'::cf_node_kind, 'GWP', 'neutral'::cash_direction, 102),
  ('cx_tben', 'capex', 'group'::cf_node_kind, 'Tbilisi Energi', 'neutral'::cash_direction, 103),
  ('cx_telasi', 'capex', 'group'::cf_node_kind, 'Telasi', 'neutral'::cash_direction, 104),
  ('cx_tsav', 'capex', 'group'::cf_node_kind, 'Tsavkisi Heights', 'neutral'::cash_direction, 105),
  ('cxc1', 'cx_cube', 'class'::cf_node_kind, 'Advance', 'out'::cash_direction, 110),
  ('cxc2', 'cx_cube', 'class'::cf_node_kind, 'Preparatory works and safety', 'out'::cash_direction, 111),
  ('cxc3', 'cx_cube', 'class'::cf_node_kind, 'Stormwater drainage', 'out'::cash_direction, 112),
  ('cxc4', 'cx_cube', 'class'::cf_node_kind, 'Sewerage system', 'out'::cash_direction, 113),
  ('cxc5', 'cx_cube', 'class'::cf_node_kind, 'Road construction', 'out'::cash_direction, 114),
  ('cxc6', 'cx_cube', 'class'::cf_node_kind, 'Outdoor lighting', 'out'::cash_direction, 115),
  ('cxc7', 'cx_cube', 'class'::cf_node_kind, 'Public park / square', 'out'::cash_direction, 116),
  ('cxc8', 'cx_cube', 'class'::cf_node_kind, 'Expert assessment and studies cost - 2%', 'out'::cash_direction, 117),
  ('cxg1', 'cx_gwp', 'class'::cf_node_kind, 'Water (amount to be confirmed by GWP)', 'out'::cash_direction, 120),
  ('cxt1', 'cx_tben', 'class'::cf_node_kind, 'Natural gas', 'out'::cash_direction, 121),
  ('cxl1', 'cx_telasi', 'class'::cf_node_kind, 'Electricity / subscription fee', 'out'::cash_direction, 122),
  ('cxs1', 'cx_tsav', 'class'::cf_node_kind, 'Project manager', 'out'::cash_direction, 130),
  ('cxs2', 'cx_tsav', 'class'::cf_node_kind, 'Site manager', 'out'::cash_direction, 131),
  ('cxs3', 'cx_tsav', 'class'::cf_node_kind, 'Construction supervision', 'out'::cash_direction, 132),
  ('cxs4', 'cx_tsav', 'class'::cf_node_kind, 'Occupational safety', 'out'::cash_direction, 133),
  ('cxs5', 'cx_tsav', 'class'::cf_node_kind, 'Environmental protection', 'out'::cash_direction, 134),
  ('cxs6', 'cx_tsav', 'class'::cf_node_kind, 'Other support personnel', 'out'::cash_direction, 135),
  ('cxs7', 'cx_tsav', 'class'::cf_node_kind, 'Administrative building fit-out', 'out'::cash_direction, 136),
  ('cxs8', 'cx_tsav', 'class'::cf_node_kind, 'Temporary administrative structure', 'out'::cash_direction, 137);
create temp table _idmap on commit drop as select k, gen_random_uuid() as id from _n;
insert into cf_nodes (id, company_id, structure_version_id, parent_id, kind, label, cash_direction, sort_order, is_active)
select m.id, 'd98b696b-8b99-411d-b3d0-a4a9eb12b15a', '43bff1d1-a2ce-420b-ae0a-0d60d6a5e6d0', pm.id, n.kind, n.label, n.dir, n.ord, true
from _n n join _idmap m on m.k = n.k left join _idmap pm on pm.k = n.parent_k;
insert into classification_rules (org_id, company_id, class_id, name, rule_type, debit_account_pattern, credit_account_pattern, priority, confidence_score, is_active)
select '1c497127-5d71-43f7-abc3-f899bec61bbe', 'd98b696b-8b99-411d-b3d0-a4a9eb12b15a',
  (select id from cf_nodes where company_id='d98b696b-8b99-411d-b3d0-a4a9eb12b15a' and structure_version_id='43bff1d1-a2ce-420b-ae0a-0d60d6a5e6d0' and kind='class' and label='Cash inflows from sales'),
  '1210 / 6100 -> Cash inflows from sales', 'account_pair'::classification_rule_type, '1210', '6100', 50, 0.95, true;
update transactions t
  set class_id = (select id from cf_nodes where company_id='d98b696b-8b99-411d-b3d0-a4a9eb12b15a' and structure_version_id='43bff1d1-a2ce-420b-ae0a-0d60d6a5e6d0' and kind='class' and label='Cash inflows from sales'),
      classification_status = 'confirmed',
      matched_rule_id = case when s.classification_source = 'rule'
        then (select id from classification_rules where company_id='d98b696b-8b99-411d-b3d0-a4a9eb12b15a' and is_active and name='1210 / 6100 -> Cash inflows from sales' order by created_at desc limit 1)
        else null end
  from _sales s where t.id = s.id;
commit;
