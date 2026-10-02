--
-- PostgreSQL database dump
--

\restrict Vwhka6fKapC0n4VEBby1mZ1EzHLrxI0Ldjiu6nw61PJR5S8uBOfAaf1yB3ULEEV

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
-- Name: orders; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    items jsonb NOT NULL,
    total numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by integer,
    completed_at timestamp with time zone,
    order_type character varying(10) DEFAULT 'sale'::character varying NOT NULL,
    is_takeaway boolean DEFAULT false NOT NULL,
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    display_code character varying(10),
    CONSTRAINT orders_order_type_check CHECK (((order_type)::text = ANY (ARRAY[('sale'::character varying)::text, ('gift'::character varying)::text])))
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
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL
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
-- Name: sessions; Type: TABLE; Schema: public; Owner: colettas
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    name character varying(100),
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL,
    declared_cash numeric(10,2),
    expected_cash numeric(10,2)
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
    active boolean DEFAULT true NOT NULL
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
    tenant_id integer DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer NOT NULL
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
-- Name: copy_types id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types ALTER COLUMN id SET DEFAULT nextval('public.copy_types_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: print_settings id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.print_settings ALTER COLUMN id SET DEFAULT nextval('public.print_settings_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


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
-- Name: copy_types copy_types_name_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types
    ADD CONSTRAINT copy_types_name_key UNIQUE (name);


--
-- Name: copy_types copy_types_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types
    ADD CONSTRAINT copy_types_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


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
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


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
-- Name: idx_copy_types_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_copy_types_tenant ON public.copy_types USING btree (tenant_id);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_orders_tenant ON public.orders USING btree (tenant_id);


--
-- Name: idx_print_settings_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_print_settings_tenant ON public.print_settings USING btree (tenant_id);


--
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id);


--
-- Name: idx_sessions_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_sessions_tenant ON public.sessions USING btree (tenant_id);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: colettas
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


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
-- Name: copy_types copy_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.copy_types
    ADD CONSTRAINT copy_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


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
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: colettas
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


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
-- Name: copy_types; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.copy_types ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: print_settings; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

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
-- Name: copy_types tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.copy_types USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: orders tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.orders USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: print_settings tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.print_settings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


--
-- Name: products tenant_isolation; Type: POLICY; Schema: public; Owner: colettas
--

CREATE POLICY tenant_isolation ON public.products USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer));


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

CREATE POLICY tenant_isolation ON public.users USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::integer) OR (current_setting('app.allow_login_lookup'::text, true) = 'true'::text)));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: colettas
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE _migrations; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public._migrations TO standmanager_app;


--
-- Name: SEQUENCE _migrations_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public._migrations_id_seq TO standmanager_app;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.audit_logs TO standmanager_app;


--
-- Name: SEQUENCE audit_logs_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.audit_logs_id_seq TO standmanager_app;


--
-- Name: TABLE copy_types; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.copy_types TO standmanager_app;


--
-- Name: SEQUENCE copy_types_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.copy_types_id_seq TO standmanager_app;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.orders TO standmanager_app;


--
-- Name: SEQUENCE orders_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.orders_id_seq TO standmanager_app;


--
-- Name: TABLE print_settings; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.print_settings TO standmanager_app;


--
-- Name: SEQUENCE print_settings_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.print_settings_id_seq TO standmanager_app;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.products TO standmanager_app;


--
-- Name: SEQUENCE products_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.products_id_seq TO standmanager_app;


--
-- Name: TABLE sessions; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.sessions TO standmanager_app;


--
-- Name: SEQUENCE sessions_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.sessions_id_seq TO standmanager_app;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.settings TO standmanager_app;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.tenants TO standmanager_app;


--
-- Name: SEQUENCE tenants_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.tenants_id_seq TO standmanager_app;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON TABLE public.users TO standmanager_app;


--
-- Name: SEQUENCE users_id_seq; Type: ACL; Schema: public; Owner: colettas
--

GRANT ALL ON SEQUENCE public.users_id_seq TO standmanager_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: colettas
--

ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT ALL ON SEQUENCES TO standmanager_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: colettas
--

ALTER DEFAULT PRIVILEGES FOR ROLE colettas IN SCHEMA public GRANT ALL ON TABLES TO standmanager_app;


--
-- PostgreSQL database dump complete
--

\unrestrict Vwhka6fKapC0n4VEBby1mZ1EzHLrxI0Ldjiu6nw61PJR5S8uBOfAaf1yB3ULEEV

