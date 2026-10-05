--
-- PostgreSQL database dump
--

\restrict bsCuEf1EShaNqXpErXb7BRUhBPBTrmdr5U9zWtz4jh57uWLaavAanJDm4TyHhIf

-- Dumped from database version 17.10 (Homebrew)
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public._migrations (
    id integer NOT NULL,
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public._migrations OWNER TO colettas;

--
-- Name: _migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public._migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public._migrations_id_seq OWNER TO colettas;

--
-- Name: _migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public._migrations_id_seq OWNED BY public._migrations.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    action text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


ALTER TABLE public.audit_logs OWNER TO colettas;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO colettas;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: checks; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.checks (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    session_id integer NOT NULL,
    table_id integer,
    number integer NOT NULL,
    covers integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_by integer,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    bill_requested_at timestamp with time zone,
    closed_at timestamp with time zone,
    merged_into integer,
    cover_charge numeric(8,2) DEFAULT 0 NOT NULL,
    CONSTRAINT checks_cover_charge_check CHECK ((cover_charge >= (0)::numeric)),
    CONSTRAINT checks_covers_check CHECK (((covers >= 0) AND (covers <= 99))),
    CONSTRAINT checks_number_check CHECK ((number > 0)),
    CONSTRAINT checks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'paid'::text, 'void'::text])))
);

ALTER TABLE ONLY public.checks FORCE ROW LEVEL SECURITY;


ALTER TABLE public.checks OWNER TO colettas;

--
-- Name: checks_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.checks_id_seq OWNER TO colettas;

--
-- Name: checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.checks_id_seq OWNED BY public.checks.id;


--
-- Name: copy_types; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.copy_types (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.copy_types FORCE ROW LEVEL SECURITY;


ALTER TABLE public.copy_types OWNER TO colettas;

--
-- Name: copy_types_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.copy_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.copy_types_id_seq OWNER TO colettas;

--
-- Name: copy_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.copy_types_id_seq OWNED BY public.copy_types.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.courses (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT courses_name_check CHECK ((length(btrim(name)) > 0))
);

ALTER TABLE ONLY public.courses FORCE ROW LEVEL SECURITY;


ALTER TABLE public.courses OWNER TO colettas;

--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.courses_id_seq OWNER TO colettas;

--
-- Name: courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.devices (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    letter character(1) NOT NULL,
    name character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT devices_letter_check CHECK ((letter ~ '^[A-Z]$'::text))
);

ALTER TABLE ONLY public.devices FORCE ROW LEVEL SECURITY;


ALTER TABLE public.devices OWNER TO colettas;

--
-- Name: devices_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.devices_id_seq OWNER TO colettas;

--
-- Name: devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.devices_id_seq OWNED BY public.devices.id;


--
-- Name: dining_tables; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.dining_tables (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    room_id integer NOT NULL,
    name text NOT NULL,
    seats integer DEFAULT 2 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    x integer,
    y integer,
    w integer,
    h integer,
    shape text DEFAULT 'rect'::text NOT NULL,
    CONSTRAINT dining_tables_h_check CHECK (((h >= 1) AND (h <= 30))),
    CONSTRAINT dining_tables_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT dining_tables_placement_complete CHECK ((((x IS NULL) AND (y IS NULL) AND (w IS NULL) AND (h IS NULL)) OR ((x IS NOT NULL) AND (y IS NOT NULL) AND (w IS NOT NULL) AND (h IS NOT NULL)))),
    CONSTRAINT dining_tables_seats_check CHECK (((seats >= 1) AND (seats <= 99))),
    CONSTRAINT dining_tables_shape_check CHECK ((shape = ANY (ARRAY['rect'::text, 'round'::text]))),
    CONSTRAINT dining_tables_w_check CHECK (((w >= 1) AND (w <= 30))),
    CONSTRAINT dining_tables_x_check CHECK ((x >= 0)),
    CONSTRAINT dining_tables_y_check CHECK ((y >= 0))
);

ALTER TABLE ONLY public.dining_tables FORCE ROW LEVEL SECURITY;


ALTER TABLE public.dining_tables OWNER TO colettas;

--
-- Name: dining_tables_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.dining_tables_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dining_tables_id_seq OWNER TO colettas;

--
-- Name: dining_tables_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.dining_tables_id_seq OWNED BY public.dining_tables.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    order_id integer NOT NULL,
    "position" integer NOT NULL,
    product_id bigint,
    name text NOT NULL,
    category text,
    print_destination text,
    quantity integer NOT NULL,
    unit_price numeric(16,8) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    original_price numeric(12,4),
    line_type text DEFAULT 'sale'::text NOT NULL,
    discount_mode text,
    discount_value numeric(12,4),
    note text DEFAULT ''::text NOT NULL,
    prep_status text DEFAULT 'new'::text NOT NULL,
    ready_at timestamp with time zone,
    served_at timestamp with time zone,
    CONSTRAINT order_items_line_type_check CHECK ((line_type = ANY (ARRAY['sale'::text, 'gift'::text, 'discount'::text]))),
    CONSTRAINT order_items_position_check CHECK (("position" >= 0)),
    CONSTRAINT order_items_prep_status_check CHECK ((prep_status = ANY (ARRAY['new'::text, 'preparing'::text, 'ready'::text, 'served'::text]))),
    CONSTRAINT order_items_print_destination_check CHECK ((print_destination = ANY (ARRAY['bar'::text, 'kitchen'::text, 'both'::text]))),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);

ALTER TABLE ONLY public.order_items FORCE ROW LEVEL SECURITY;


ALTER TABLE public.order_items OWNER TO colettas;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO colettas;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    total numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by integer,
    completed_at timestamp with time zone,
    order_type character varying(10) DEFAULT 'sale'::character varying NOT NULL,
    is_takeaway boolean DEFAULT false NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    display_code character varying(10),
    session_id integer,
    client_order_id uuid,
    device_id integer,
    device_seq integer,
    check_id integer,
    course_seq integer,
    course_name text,
    fired_at timestamp with time zone,
    CONSTRAINT orders_course_seq_check CHECK ((course_seq >= 1)),
    CONSTRAINT orders_device_pair_check CHECK (((device_id IS NULL) = (device_seq IS NULL))),
    CONSTRAINT orders_device_seq_check CHECK ((device_seq > 0)),
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY ((ARRAY['sale'::character varying, 'gift'::character varying, 'discount'::character varying, 'cover'::character varying])::text[]))),
    CONSTRAINT orders_scheduled_on_check CHECK (((status <> 'scheduled'::text) OR ((check_id IS NOT NULL) AND (course_seq IS NOT NULL)))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'pending'::text, 'preparing'::text, 'completed'::text, 'canceled'::text])))
);

ALTER TABLE ONLY public.orders FORCE ROW LEVEL SECURITY;


ALTER TABLE public.orders OWNER TO colettas;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO colettas;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payment_items; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.payment_items (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    payment_id integer NOT NULL,
    order_item_id integer NOT NULL,
    quantity integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    CONSTRAINT payment_items_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_items_quantity_check CHECK ((quantity > 0))
);

ALTER TABLE ONLY public.payment_items FORCE ROW LEVEL SECURITY;


ALTER TABLE public.payment_items OWNER TO colettas;

--
-- Name: payment_items_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.payment_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_items_id_seq OWNER TO colettas;

--
-- Name: payment_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.payment_items_id_seq OWNED BY public.payment_items.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    check_id integer NOT NULL,
    method text NOT NULL,
    amount numeric(12,2) NOT NULL,
    paid_by integer,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'card'::text, 'other'::text])))
);

ALTER TABLE ONLY public.payments FORCE ROW LEVEL SECURITY;


ALTER TABLE public.payments OWNER TO colettas;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO colettas;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: print_settings; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.print_settings (
    id integer NOT NULL,
    copy_type_id integer NOT NULL,
    printer_type character varying(10) DEFAULT 'network'::character varying NOT NULL,
    printer_address character varying(255),
    enabled boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT print_settings_printer_type_check CHECK (((printer_type)::text = ANY (ARRAY[('network'::character varying)::text, ('usb'::character varying)::text])))
);

ALTER TABLE ONLY public.print_settings FORCE ROW LEVEL SECURITY;


ALTER TABLE public.print_settings OWNER TO colettas;

--
-- Name: print_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.print_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.print_settings_id_seq OWNER TO colettas;

--
-- Name: print_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.print_settings_id_seq OWNED BY public.print_settings.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    category text,
    color text DEFAULT '#3b82f6'::text,
    visible boolean DEFAULT true,
    print_destination character varying(10) DEFAULT 'both'::character varying NOT NULL,
    stock integer,
    stock_enabled boolean DEFAULT false NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    course_id integer,
    CONSTRAINT products_print_destination_check CHECK (((print_destination)::text = ANY ((ARRAY['bar'::character varying, 'kitchen'::character varying, 'both'::character varying])::text[])))
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;


ALTER TABLE public.products OWNER TO colettas;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO colettas;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: room_elements; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.room_elements (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    room_id integer NOT NULL,
    kind text DEFAULT 'wall'::text NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    w integer NOT NULL,
    h integer NOT NULL,
    CONSTRAINT room_elements_h_check CHECK (((h >= 1) AND (h <= 60))),
    CONSTRAINT room_elements_kind_check CHECK ((kind = ANY (ARRAY['wall'::text, 'divider'::text]))),
    CONSTRAINT room_elements_w_check CHECK (((w >= 1) AND (w <= 60))),
    CONSTRAINT room_elements_x_check CHECK ((x >= 0)),
    CONSTRAINT room_elements_y_check CHECK ((y >= 0))
);

ALTER TABLE ONLY public.room_elements FORCE ROW LEVEL SECURITY;


ALTER TABLE public.room_elements OWNER TO colettas;

--
-- Name: room_elements_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.room_elements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.room_elements_id_seq OWNER TO colettas;

--
-- Name: room_elements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.room_elements_id_seq OWNED BY public.room_elements.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.rooms (
    id integer NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    grid_w integer DEFAULT 24 NOT NULL,
    grid_h integer DEFAULT 16 NOT NULL,
    CONSTRAINT rooms_grid_h_check CHECK (((grid_h >= 4) AND (grid_h <= 60))),
    CONSTRAINT rooms_grid_w_check CHECK (((grid_w >= 4) AND (grid_w <= 60))),
    CONSTRAINT rooms_name_check CHECK ((length(btrim(name)) > 0))
);

ALTER TABLE ONLY public.rooms FORCE ROW LEVEL SECURITY;


ALTER TABLE public.rooms OWNER TO colettas;

--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rooms_id_seq OWNER TO colettas;

--
-- Name: rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.rooms_id_seq OWNED BY public.rooms.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    name character varying(100),
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    declared_cash numeric(10,2),
    expected_cash numeric(10,2),
    order_counter integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.sessions FORCE ROW LEVEL SECURITY;


ALTER TABLE public.sessions OWNER TO colettas;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO colettas;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.settings (
    key character varying(100) NOT NULL,
    value text,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.settings FORCE ROW LEVEL SECURITY;


ALTER TABLE public.settings OWNER TO colettas;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'trial'::text NOT NULL,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    business_type text DEFAULT 'sagra'::text NOT NULL,
    modules text[] DEFAULT ARRAY['kds'::text, 'stats'::text, 'qr_menu'::text] NOT NULL,
    CONSTRAINT tenants_business_type_check CHECK ((business_type = ANY (ARRAY['sagra'::text, 'paninaro'::text, 'ristorante'::text])))
);


ALTER TABLE public.tenants OWNER TO colettas;

--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tenants_id_seq OWNER TO colettas;

--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash text,
    role character varying(20) NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'responsabile'::character varying, 'cassa'::character varying, 'cucina'::character varying])::text[])))
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


ALTER TABLE public.users OWNER TO colettas;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: colettas
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO colettas;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: colettas
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: _migrations id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public._migrations ALTER COLUMN id SET DEFAULT nextval('public._migrations_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: checks id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks ALTER COLUMN id SET DEFAULT nextval('public.checks_id_seq'::regclass);


--
-- Name: copy_types id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types ALTER COLUMN id SET DEFAULT nextval('public.copy_types_id_seq'::regclass);


--
-- Name: courses id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.courses ALTER COLUMN id SET DEFAULT nextval('public.courses_id_seq'::regclass);


--
-- Name: devices id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.devices ALTER COLUMN id SET DEFAULT nextval('public.devices_id_seq'::regclass);


--
-- Name: dining_tables id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.dining_tables ALTER COLUMN id SET DEFAULT nextval('public.dining_tables_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payment_items id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payment_items ALTER COLUMN id SET DEFAULT nextval('public.payment_items_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: print_settings id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings ALTER COLUMN id SET DEFAULT nextval('public.print_settings_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: room_elements id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.room_elements ALTER COLUMN id SET DEFAULT nextval('public.room_elements_id_seq'::regclass);


--
-- Name: rooms id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.rooms ALTER COLUMN id SET DEFAULT nextval('public.rooms_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: _migrations _migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_name_key UNIQUE (name);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: checks checks_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_pkey PRIMARY KEY (id);


--
-- Name: copy_types copy_types_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types
    ADD CONSTRAINT copy_types_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: devices devices_tenant_id_letter_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_tenant_id_letter_key UNIQUE (tenant_id, letter);


--
-- Name: dining_tables dining_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_items payment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: print_settings print_settings_copy_type_id_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_copy_type_id_key UNIQUE (copy_type_id);


--
-- Name: print_settings print_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: room_elements room_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.room_elements
    ADD CONSTRAINT room_elements_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, key);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs USING btree (tenant_id);


--
-- Name: idx_checks_tenant_status; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_checks_tenant_status ON public.checks USING btree (tenant_id, status);


--
-- Name: idx_copy_types_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_copy_types_tenant ON public.copy_types USING btree (tenant_id);


--
-- Name: idx_courses_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_courses_tenant ON public.courses USING btree (tenant_id);


--
-- Name: idx_devices_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_devices_tenant ON public.devices USING btree (tenant_id);


--
-- Name: idx_dining_tables_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_dining_tables_tenant ON public.dining_tables USING btree (tenant_id);


--
-- Name: idx_order_items_ready; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_order_items_ready ON public.order_items USING btree (order_id) WHERE (prep_status = 'ready'::text);


--
-- Name: idx_order_items_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_order_items_tenant ON public.order_items USING btree (tenant_id);


--
-- Name: idx_order_items_tenant_product; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_order_items_tenant_product ON public.order_items USING btree (tenant_id, product_id);


--
-- Name: idx_orders_check; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_orders_check ON public.orders USING btree (check_id) WHERE (check_id IS NOT NULL);


--
-- Name: idx_orders_tenant_created_at; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_orders_tenant_created_at ON public.orders USING btree (tenant_id, created_at DESC);


--
-- Name: idx_orders_tenant_session_status; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_orders_tenant_session_status ON public.orders USING btree (tenant_id, session_id, status);


--
-- Name: idx_payment_items_order_item; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_payment_items_order_item ON public.payment_items USING btree (order_item_id);


--
-- Name: idx_payment_items_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_payment_items_tenant ON public.payment_items USING btree (tenant_id);


--
-- Name: idx_payments_check; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_payments_check ON public.payments USING btree (check_id);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id);


--
-- Name: idx_print_settings_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_print_settings_tenant ON public.print_settings USING btree (tenant_id);


--
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id);


--
-- Name: idx_room_elements_room; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_room_elements_room ON public.room_elements USING btree (room_id);


--
-- Name: idx_room_elements_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_room_elements_tenant ON public.room_elements USING btree (tenant_id);


--
-- Name: idx_sessions_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_sessions_tenant ON public.sessions USING btree (tenant_id);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: uniq_checks_open_table; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_checks_open_table ON public.checks USING btree (table_id) WHERE ((status = 'open'::text) AND (table_id IS NOT NULL));


--
-- Name: uniq_checks_session_number; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_checks_session_number ON public.checks USING btree (session_id, number);


--
-- Name: uniq_copy_types_tenant_name; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_copy_types_tenant_name ON public.copy_types USING btree (tenant_id, name);


--
-- Name: uniq_courses_tenant_name; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_courses_tenant_name ON public.courses USING btree (tenant_id, lower(name));


--
-- Name: uniq_dining_tables_room_name; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_dining_tables_room_name ON public.dining_tables USING btree (room_id, lower(name));


--
-- Name: uniq_order_items_order_position; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_order_items_order_position ON public.order_items USING btree (order_id, "position");


--
-- Name: uniq_orders_client_order_id; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_orders_client_order_id ON public.orders USING btree (tenant_id, client_order_id) WHERE (client_order_id IS NOT NULL);


--
-- Name: uniq_orders_device_seq; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_orders_device_seq ON public.orders USING btree (tenant_id, session_id, device_id, device_seq) WHERE (device_id IS NOT NULL);


--
-- Name: uniq_payment_items_payment_item; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_payment_items_payment_item ON public.payment_items USING btree (payment_id, order_item_id);


--
-- Name: uniq_rooms_tenant_name; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_rooms_tenant_name ON public.rooms USING btree (tenant_id, lower(name));


--
-- Name: uniq_sessions_open_per_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_sessions_open_per_tenant ON public.sessions USING btree (tenant_id) WHERE (end_time IS NULL);


--
-- Name: uniq_users_tenant_username; Type: INDEX; Schema: public; Owner: colettas
--

CREATE UNIQUE INDEX uniq_users_tenant_username ON public.users USING btree (tenant_id, username);


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: checks checks_merged_into_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.checks(id);


--
-- Name: checks checks_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: checks checks_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: checks checks_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.dining_tables(id);


--
-- Name: checks checks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: copy_types copy_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types
    ADD CONSTRAINT copy_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: courses courses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: devices devices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: dining_tables dining_tables_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);


--
-- Name: dining_tables dining_tables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.dining_tables
    ADD CONSTRAINT dining_tables_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: orders orders_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.checks(id);


--
-- Name: orders orders_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id);


--
-- Name: orders orders_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payment_items payment_items_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: payment_items payment_items_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payment_items payment_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payment_items
    ADD CONSTRAINT payment_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payments payments_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.checks(id);


--
-- Name: payments payments_paid_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: print_settings print_settings_copy_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_copy_type_id_fkey FOREIGN KEY (copy_type_id) REFERENCES public.copy_types(id) ON DELETE CASCADE;


--
-- Name: print_settings print_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: products products_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: room_elements room_elements_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.room_elements
    ADD CONSTRAINT room_elements_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_elements room_elements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.room_elements
    ADD CONSTRAINT room_elements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: rooms rooms_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sessions sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: checks; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;

--
-- Name: copy_types; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.copy_types ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--
-- Name: dining_tables; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: users master_read; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY master_read ON public.users FOR SELECT TO standmanager_master USING (true);


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_items; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.payment_items ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: print_settings; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: room_elements; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.room_elements ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.audit_logs USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: checks tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.checks USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: copy_types tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.copy_types USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: courses tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.courses USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: devices tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.devices USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: dining_tables tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.dining_tables USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: order_items tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.order_items USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: orders tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.orders USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: payment_items tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.payment_items USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: payments tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.payments USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: print_settings tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.print_settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: products tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.products USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: room_elements tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.room_elements USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: rooms tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.rooms USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: sessions tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.sessions USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: settings tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: users tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.users USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO standmanager_app;
GRANT USAGE ON SCHEMA public TO standmanager_master;


--
-- Name: TABLE _migrations; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public._migrations TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public._migrations TO standmanager_master;


--
-- Name: SEQUENCE _migrations_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public._migrations_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public._migrations_id_seq TO standmanager_master;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT ON TABLE public.audit_logs TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.audit_logs TO standmanager_master;


--
-- Name: SEQUENCE audit_logs_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.audit_logs_id_seq TO standmanager_master;


--
-- Name: TABLE checks; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.checks TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.checks TO standmanager_master;


--
-- Name: SEQUENCE checks_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.checks_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.checks_id_seq TO standmanager_master;


--
-- Name: TABLE copy_types; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.copy_types TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.copy_types TO standmanager_master;


--
-- Name: SEQUENCE copy_types_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.copy_types_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.copy_types_id_seq TO standmanager_master;


--
-- Name: TABLE courses; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courses TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courses TO standmanager_master;


--
-- Name: SEQUENCE courses_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.courses_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.courses_id_seq TO standmanager_master;


--
-- Name: TABLE devices; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.devices TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.devices TO standmanager_master;


--
-- Name: SEQUENCE devices_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.devices_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.devices_id_seq TO standmanager_master;


--
-- Name: TABLE dining_tables; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.dining_tables TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.dining_tables TO standmanager_master;


--
-- Name: SEQUENCE dining_tables_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.dining_tables_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.dining_tables_id_seq TO standmanager_master;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_items TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_items TO standmanager_master;


--
-- Name: SEQUENCE order_items_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.order_items_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.order_items_id_seq TO standmanager_master;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.orders TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.orders TO standmanager_master;


--
-- Name: SEQUENCE orders_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.orders_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.orders_id_seq TO standmanager_master;


--
-- Name: TABLE payment_items; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment_items TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment_items TO standmanager_master;


--
-- Name: SEQUENCE payment_items_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.payment_items_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.payment_items_id_seq TO standmanager_master;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO standmanager_master;


--
-- Name: SEQUENCE payments_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.payments_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.payments_id_seq TO standmanager_master;


--
-- Name: TABLE print_settings; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.print_settings TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.print_settings TO standmanager_master;


--
-- Name: SEQUENCE print_settings_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.print_settings_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.print_settings_id_seq TO standmanager_master;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO standmanager_master;


--
-- Name: SEQUENCE products_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.products_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.products_id_seq TO standmanager_master;


--
-- Name: TABLE room_elements; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.room_elements TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.room_elements TO standmanager_master;


--
-- Name: SEQUENCE room_elements_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.room_elements_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.room_elements_id_seq TO standmanager_master;


--
-- Name: TABLE rooms; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rooms TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rooms TO standmanager_master;


--
-- Name: SEQUENCE rooms_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.rooms_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.rooms_id_seq TO standmanager_master;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sessions TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sessions TO standmanager_master;


--
-- Name: SEQUENCE sessions_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.sessions_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.sessions_id_seq TO standmanager_master;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settings TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.settings TO standmanager_master;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT ON TABLE public.tenants TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tenants TO standmanager_master;


--
-- Name: SEQUENCE tenants_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.tenants_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.tenants_id_seq TO standmanager_master;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: colettas
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO standmanager_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO standmanager_master;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.users_id_seq TO standmanager_app;
GRANT SELECT,USAGE ON SEQUENCE public.users_id_seq TO standmanager_master;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: colettas
--

ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT ALL ON SEQUENCES TO standmanager_app;
ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO standmanager_master;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: colettas
--

ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO standmanager_app;
ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO standmanager_master;


--
-- PostgreSQL database dump complete
--

\unrestrict bsCuEf1EShaNqXpErXb7BRUhBPBTrmdr5U9zWtz4jh57uWLaavAanJDm4TyHhIf

