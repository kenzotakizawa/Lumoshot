import { z } from 'zod';

// Target fields shared by interactive steps.
// Resolution priority at runtime: ref -> selector -> label_query
const TARGET_FIELDS = {
  ref: z.number().optional(),
  selector: z.string().optional(),
  label_query: z.string().optional(),
};

const WAIT_FIELDS = {
  strategy: z.enum(['auto', 'selector', 'timeout']).optional(),
  selector: z.string().optional(),
  timeout: z.number().optional(),
};

const THEME_SCHEMA = z.enum(['red', 'blue', 'mono']);
const CALLOUT_STYLE_FIELDS = {
  callout_background: z.string().optional(),
  callout_border_color: z.string().optional(),
  callout_text_color: z.string().optional(),
};

export const FlowStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('capture') }),
  z.object({
    action: z.literal('click'),
    ...TARGET_FIELDS,
    description: z.string().optional(),
    ...CALLOUT_STYLE_FIELDS,
  }),
  z.object({
    action: z.literal('fill'),
    ...TARGET_FIELDS,
    value: z.string(),
    description: z.string().optional(),
    ...CALLOUT_STYLE_FIELDS,
    badge_color: z.string().optional(),
  }),
  z.object({
    action: z.literal('scroll'),
    direction: z.enum(['up', 'down', 'left', 'right']),
    amount: z.number().default(300),
  }),
  z.object({ action: z.literal('hover'), ...TARGET_FIELDS }),
  z.object({
    action: z.literal('select'),
    ...TARGET_FIELDS,
    value: z.string(),
    description: z.string().optional(),
    strategy: z.enum(['native', 'combobox', 'auto']).optional().default('auto'),
    ...CALLOUT_STYLE_FIELDS,
  }),
  z.object({
    action: z.literal('wait'),
    ...WAIT_FIELDS,
  }),
]);

export const PreFlowStepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('navigate'),
    url: z.string().url(),
    wait: z.object(WAIT_FIELDS).optional(),
  }),
  z.object({ action: z.literal('click'), ...TARGET_FIELDS }),
  z.object({ action: z.literal('fill'), ...TARGET_FIELDS, value: z.string() }),
  z.object({
    action: z.literal('select'),
    ...TARGET_FIELDS,
    value: z.string(),
    strategy: z.enum(['native', 'combobox', 'auto']).optional().default('auto'),
  }),
  z.object({
    action: z.literal('wait'),
    ...WAIT_FIELDS,
  }),
]);

const CookieInputSchema = z
  .object({
    name: z.string().min(1),
    value: z.string(),
    url: z.string().url().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  })
  .superRefine((cookie, ctx) => {
    if (!cookie.url && !cookie.domain) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cookie must include either url or domain',
        path: ['url'],
      });
    }
  });

export const ExecuteFlowInputSchema = z.object({
  url: z.string().url(),
  preset: z.enum(['auto', 'precise', 'friendly', 'neutral']).optional().default('auto'),
  theme: THEME_SCHEMA.optional(),
  visualization_mode: z.enum(['step', 'summary_only']).optional().default('step'),
  pre_steps: z.array(PreFlowStepSchema).optional(),
  steps: z.array(FlowStepSchema),
  cookies: z.array(CookieInputSchema).optional(),
  output_format: z.enum(['png', 'jpeg']).optional().default('png'),
  scale: z.number().positive().max(4).optional().default(1),
  badge_color: z.string().optional(),
  auto_capture_each_step: z.boolean().optional().default(true),
  default_wait: z
    .object({
      strategy: WAIT_FIELDS.strategy,
      timeout: WAIT_FIELDS.timeout,
    })
    .optional(),
});

export type ExecuteFlowInput = z.infer<typeof ExecuteFlowInputSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type PreFlowStep = z.infer<typeof PreFlowStepSchema>;
